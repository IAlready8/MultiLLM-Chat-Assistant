import { NextRequest, NextResponse } from 'next/server'
import { streamChatMessage } from '@/services/api-service'
import { ProviderConfig } from '@/lib/config-schemas'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { configManager } from '@/lib/config-manager'

interface LLMStreamRequest {
  provider: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
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
    case 'google':
      return apiKey.length > 30 && !apiKey.includes(' ');
    case 'openrouter':
      return apiKey.startsWith('sk-or-') && apiKey.length > 20;
    default:
      return apiKey.length > 10; // Basic check for other providers
  }
}

// Simple rate limiter using in-memory store
const rateLimits = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(provider: string, config: ProviderConfig): boolean {
  const key = `rate_limit:${provider}`;
  const now = Date.now();
  const windowMs = config.rateLimits.window;
  const maxRequests = config.rateLimits.requests;
  
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
    const body: LLMStreamRequest = await request.json()
    const { provider, messages, model } = body

    // Validate request
    if (!provider || !messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Provider and messages are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const authCheck = await getAuthenticatedUser()
    if (authCheck instanceof NextResponse) return authCheck

    // Get provider config from server-side cache/database
    const providerConfig = await configManager.getProviderConfig(authCheck.user.id, provider)

    if (!providerConfig || !providerConfig.apiKey) {
      return new Response(
        JSON.stringify({ error: `Provider ${provider} is not configured` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate API key format
    if (!validateApiKeyFormat(provider, providerConfig.apiKey)) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key format for the selected provider' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limits
    if (!checkRateLimit(provider, providerConfig)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
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
          { model: model || providerConfig.models[0] }
        )
        
        // Write done event when complete
        await writeEvent({ type: 'done' })
      } catch (error: any) {
        // Write error event if something goes wrong
        await writeEvent({
          type: 'error',
          error: error.message || 'Streaming error occurred',
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

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { type: error.constructor?.name })
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
