import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'
import { validateApiKeyFormat } from '@/lib/provider-key-test'
import { isProviderApiKeyRequired } from '@/lib/provider-registry'
import { checkProviderRateLimit, type ProviderRateLimitConfig } from '@/lib/provider-rate-limit'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import {
  getProviderAdapter,
  classifyProviderError,
} from '@/lib/providers'
import type { ProviderRequest, ProviderAdapterConfig } from '@/lib/providers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LLMStreamRequest {
  provider: string
  messages: Array<{ role: string; content: string }>
  model?: string
  reasoning_effort?: 'off' | 'low' | 'high' | 'max'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonErrorResponse = (
  status: number,
  error: string,
  code: string,
  retryAfterSeconds?: number,
) =>
  new Response(
    JSON.stringify({ error, code }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...(retryAfterSeconds
          ? { 'Retry-After': String(retryAfterSeconds) }
          : {}),
      },
    },
  )

const safeRecordEvent = async (event: {
  event: string
  userId: string
  payload?: Record<string, unknown>
}) => {
  try {
    await recordAnalyticsEvent(event)
  } catch {
    // swallow analytics failures
  }
}

const estimatePromptTokens = (messages: any[]): number => {
  const contentLength = messages.reduce((acc: number, m: any) => {
    return acc + (typeof m?.content === 'string' ? m.content.length : 0)
  }, 0)
  return Math.max(1, Math.round(contentLength / 4))
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    let body: LLMStreamRequest
    try {
      body = await request.json()
    } catch {
      return jsonErrorResponse(400, 'Request body must be valid JSON', 'INVALID_JSON')
    }

    const providerRaw = body?.provider
    const messages = body?.messages
    const model = body?.model
    const reasoningEffort = body?.reasoning_effort

    if (
      typeof providerRaw !== 'string' ||
      providerRaw.trim().length === 0 ||
      !messages ||
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return jsonErrorResponse(400, 'Provider and messages are required', 'VALIDATION_ERROR')
    }
    if (
      reasoningEffort !== undefined &&
      !['off', 'low', 'high', 'max'].includes(reasoningEffort)
    ) {
      return jsonErrorResponse(
        400,
        'reasoning_effort must be one of: off, low, high, max',
        'VALIDATION_ERROR',
      )
    }
    const provider = providerRaw.trim().toLowerCase()

    const authCheck = await getAuthenticatedUser()
    if (authCheck instanceof NextResponse) return authCheck
    const userId = authCheck.user.id

    // Validate provider via shared registry
    if (!getProviderAdapter(provider)) {
      return jsonErrorResponse(400, `Provider '${provider}' not supported`, 'PROVIDER_UNSUPPORTED')
    }

    const [providerConfigs, apiKey] = await Promise.all([
      getUserProviderConfigs(userId),
      getUserApiKey(userId, provider),
    ])

    const providerConfig = providerConfigs.find((config: any) => config.provider === provider)

    if (!providerConfig || (apiKey === null && isProviderApiKeyRequired(provider))) {
      return jsonErrorResponse(400, `Provider ${provider} is not configured`, 'PROVIDER_NOT_CONFIGURED')
    }

    const formatError = validateApiKeyFormat(provider, apiKey ?? '')
    if (formatError) {
      return jsonErrorResponse(
        400,
        'Invalid API key format for the selected provider',
        'PROVIDER_KEY_FORMAT_INVALID',
      )
    }

    const settings = providerConfig?.settings || {}
    const providerRateLimits = (settings.rateLimits as ProviderRateLimitConfig | undefined) ||
      defaultRateLimits[provider as keyof typeof defaultRateLimits] ||
      { requests: 60, window: 60000 }
    const providerModels = (settings.models as string[] | undefined) ||
      defaultProviderModels[provider as keyof typeof defaultProviderModels] ||
      []

    const rateLimit = await checkProviderRateLimit(
      userId,
      provider,
      providerRateLimits,
    )
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(rateLimit.retryAfterMs / 1000),
      )
      return jsonErrorResponse(
        429,
        'Rate limit exceeded',
        'RATE_LIMITED',
        retryAfterSeconds,
      )
    }

    // Resolve adapter from shared provider runtime
    const adapter = getProviderAdapter(provider)!

    // Build adapter config from provider settings
    const defaultBaseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined
    const baseUrl = settings.baseUrl || defaultBaseUrl
    const extraHeaders: Record<string, string> = {}
    if (provider === 'openrouter') {
      if (settings.httpReferer) extraHeaders['HTTP-Referer'] = settings.httpReferer
      if (settings.xTitle) extraHeaders['X-Title'] = settings.xTitle
    }

    const adapterConfig: ProviderAdapterConfig = { apiKey: apiKey ?? '', baseUrl, extraHeaders }
    const providerRequest: ProviderRequest = {
      messages: messages as any,
      model: model || providerModels[0],
      reasoning_effort: reasoningEffort,
      userId,
    }

    // NDJSON streaming via TransformStream
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    const analyticsModel = providerRequest.model || 'default'
    const streamStart = Date.now()
    const promptTokens = estimatePromptTokens(messages)

    const writeEvent = async (data: any) => {
      const json = JSON.stringify(data) + '\n'
      await writer.write(encoder.encode(json))
    }

    const streamPromise = (async () => {
      try {
        let completionContent = ''
        const generator = adapter.stream(providerRequest, adapterConfig)
        for await (const chunk of generator) {
          completionContent += chunk
          await writeEvent({ type: 'chunk', content: chunk })
        }
        await writeEvent({ type: 'done' })

        // Record analytics (was previously missing from stream route)
        const completionTokens = Math.max(1, Math.round(completionContent.length / 4))
        await safeRecordEvent({
          event: 'llm_request',
          userId,
          payload: {
            provider,
            model: analyticsModel,
            stream: true,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            responseTime: Date.now() - streamStart,
          },
        })
      } catch (error: any) {
        const mappedError = classifyProviderError(error)
        await writeEvent({
          type: 'error',
          error: mappedError.error,
          code: mappedError.code,
          retryAfterSeconds: mappedError.retryAfterSeconds,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        })

        await safeRecordEvent({
          event: 'llm_error',
          userId,
          payload: {
            provider,
            model: analyticsModel,
            stream: true,
            responseTime: Date.now() - streamStart,
            message: error instanceof Error ? error.message : 'stream_error',
          },
        })
      } finally {
        writer.close()
      }
    })()

    streamPromise.catch(console.error)

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Streaming API error:', error)
    const mappedError = classifyProviderError(error)
    return jsonErrorResponse(
      mappedError.status,
      mappedError.error,
      mappedError.code,
      mappedError.retryAfterSeconds,
    )
  }
}
