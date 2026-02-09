import { NextRequest, NextResponse } from 'next/server'
import { streamChatMessage } from '@/services/api-service'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'

interface LLMStreamRequest {
  provider: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
}

type StreamRouteError = {
  status: number
  code: string
  error: string
}

const jsonErrorResponse = (status: number, error: string, code: string) =>
  new Response(
    JSON.stringify({ error, code }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )

const parseStatusFromMessage = (message: string): number | null => {
  const match = message.match(/\bHTTP\s+(\d{3})\b/i)
  if (!match) return null
  const status = Number(match[1])
  return Number.isFinite(status) ? status : null
}

const classifyStreamError = (error: unknown): StreamRouteError => {
  if (error instanceof SyntaxError) {
    return {
      status: 400,
      code: 'INVALID_JSON',
      error: 'Request body must be valid JSON',
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : 'Streaming request failed'
  const lower = message.toLowerCase()
  const upstreamStatus = parseStatusFromMessage(message)

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 401,
      code: 'PROVIDER_AUTH_ERROR',
      error: 'Provider rejected the configured API key',
    }
  }

  if (upstreamStatus === 429) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      error: 'Provider rate limit reached, please retry shortly',
    }
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('abort')
  ) {
    return {
      status: 504,
      code: 'PROVIDER_TIMEOUT',
      error: 'Provider request timed out',
    }
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again')
  ) {
    return {
      status: 503,
      code: 'NETWORK_ERROR',
      error: 'Failed to reach upstream provider',
    }
  }

  if (upstreamStatus !== null && upstreamStatus >= 500) {
    return {
      status: 503,
      code: 'PROVIDER_UNAVAILABLE',
      error: 'Provider is currently unavailable',
    }
  }

  if (upstreamStatus !== null && upstreamStatus >= 400) {
    return {
      status: 400,
      code: 'PROVIDER_REQUEST_ERROR',
      error: message,
    }
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    error: message,
  }
}

// Simple validation function for API key format
function validateApiKeyFormat(provider: string, apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Basic validation patterns for different providers
  switch (provider) {
    case 'openai':
      return apiKey.startsWith('sk-') && apiKey.length > 20;
    case 'anthropic':
      return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
    case 'googleai':
      return apiKey.length > 30 && !apiKey.includes(' ');
    case 'openrouter':
      return apiKey.startsWith('sk-or-') && apiKey.length > 20;
    default:
      return apiKey.length > 10; // Basic check for other providers
  }
}

type RateLimitConfig = {
  requests: number
  window: number
}

// Simple rate limiter using in-memory store
const rateLimits = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, provider: string, config: RateLimitConfig): boolean {
  const key = `rate_limit:${userId}:${provider}`;
  const now = Date.now();
  const windowMs = config.window;
  const maxRequests = config.requests;

  if (maxRequests < 1) {
    return false
  }
  
  const limitInfo = rateLimits.get(key);
  if (!limitInfo || now > limitInfo.resetTime) {
    // Reset the counter
    rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (limitInfo.count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  // Increment the counter
  rateLimits.set(key, { count: limitInfo.count + 1, resetTime: limitInfo.resetTime });
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Get request data
    let body: LLMStreamRequest
    try {
      body = await request.json()
    } catch {
      return jsonErrorResponse(400, 'Request body must be valid JSON', 'INVALID_JSON')
    }

    const providerRaw = body?.provider
    const messages = body?.messages
    const model = body?.model

    // Validate request
    if (
      typeof providerRaw !== 'string' ||
      providerRaw.trim().length === 0 ||
      !messages ||
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return jsonErrorResponse(400, 'Provider and messages are required', 'VALIDATION_ERROR')
    }
    const provider = providerRaw.trim().toLowerCase()

    const authCheck = await getAuthenticatedUser({ allowGuest: true })
    if (authCheck instanceof NextResponse) return authCheck

    if (!defaultProviderModels[provider as keyof typeof defaultProviderModels]) {
      return jsonErrorResponse(400, `Provider '${provider}' not supported`, 'PROVIDER_UNSUPPORTED')
    }

    const [providerConfigs, apiKey] = await Promise.all([
      getUserProviderConfigs(authCheck.user.id),
      getUserApiKey(authCheck.user.id, provider),
    ])

    const providerConfig = providerConfigs.find(config => config.provider === provider)

    if (!providerConfig || !apiKey) {
      return jsonErrorResponse(400, `Provider ${provider} is not configured`, 'PROVIDER_NOT_CONFIGURED')
    }

    // Validate API key format
    if (!validateApiKeyFormat(provider, apiKey)) {
      return jsonErrorResponse(
        400,
        'Invalid API key format for the selected provider',
        'PROVIDER_KEY_FORMAT_INVALID'
      )
    }

    const settings = providerConfig?.settings || {}
    const providerRateLimits = (settings.rateLimits as RateLimitConfig | undefined) ||
      defaultRateLimits[provider as keyof typeof defaultRateLimits] ||
      { requests: 60, window: 60000 }
    const providerModels = (settings.models as string[] | undefined) ||
      defaultProviderModels[provider as keyof typeof defaultProviderModels] ||
      []

    // Check rate limits
    if (!checkRateLimit(authCheck.user.id, provider, providerRateLimits)) {
      return jsonErrorResponse(429, 'Rate limit exceeded', 'RATE_LIMITED')
    }

    // Create a transform stream for NDJSON
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Function to write NDJSON events
    const writeEvent = async (data: any) => {
      const json = JSON.stringify(data) + '\n'
      await writer.write(encoder.encode(json))
    }

    // Start streaming in the background
    const streamPromise = (async () => {
      try {
        await streamChatMessage(
          provider,
          messages as any, // Casting to bypass ChatMessage type for now
          (chunk) => {
            // Write chunk event
            writeEvent({ type: 'chunk', content: chunk })
          },
          { model: model || providerModels[0], userId: authCheck.user.id }
        )
        
        // Write done event when complete
        await writeEvent({ type: 'done' })
      } catch (error: any) {
        const mappedError = classifyStreamError(error)
        // Write error event if something goes wrong
        await writeEvent({
          type: 'error',
          error: mappedError.error,
          code: mappedError.code,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })
      } finally {
        // Close the writable stream
        writer.close()
      }
    })()

    // Don't await the stream promise to allow streaming to proceed
    streamPromise.catch(console.error)

    // Return the readable stream as NDJSON
    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  } catch (error: any) {
    console.error('Streaming API error:', error)
    const mappedError = classifyStreamError(error)
    return jsonErrorResponse(mappedError.status, mappedError.error, mappedError.code)
  }
}
