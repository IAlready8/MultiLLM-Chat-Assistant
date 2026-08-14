import { NextRequest, NextResponse } from 'next/server'
import { errorManager, createErrorContext } from '@/lib/error-system'
import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service'
import { getAuthenticatedUser } from '@/lib/api-auth'
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
import { getProviderBaseUrl } from '@/lib/provider-endpoint'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonErrorResponse = (
  status: number,
  error: string,
  code: string,
  retryAfterSeconds?: number,
) =>
  new NextResponse(
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

const estimatePromptTokens = (messages: any[]): number => {
  const contentLength = messages.reduce((acc: number, message: any) => {
    if (!message || typeof message.content !== 'string') return acc
    return acc + message.content.length
  }, 0)
  return Math.max(1, Math.round(contentLength / 4))
}

const extractTotalTokens = (usage: any, fallbackTotal: number): number => {
  if (usage && typeof usage.total_tokens === 'number') return usage.total_tokens
  if (usage && typeof usage.totalTokens === 'number') return usage.totalTokens
  const promptTokens =
    (usage && typeof usage.prompt_tokens === 'number' && usage.prompt_tokens) ||
    (usage && typeof usage.promptTokens === 'number' && usage.promptTokens) ||
    0
  const completionTokens =
    (usage && typeof usage.completion_tokens === 'number' && usage.completion_tokens) ||
    (usage && typeof usage.completionTokens === 'number' && usage.completionTokens) ||
    0
  const combined = promptTokens + completionTokens
  return combined > 0 ? combined : fallbackTotal
}

const safeRecordEvent = async (event: {
  event: string
  userId: string
  payload?: Record<string, unknown>
}) => {
  try {
    await recordAnalyticsEvent(event)
  } catch (error) {
    console.warn('Failed to record analytics event:', error)
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let analyticsUserId: string | null = null
  let analyticsProvider = 'unknown'
  let analyticsModel = 'unknown'

  try {
    const authCheck = await getAuthenticatedUser()
    if (authCheck instanceof NextResponse) return authCheck
    const { user } = authCheck
    const userId = user.id
    analyticsUserId = userId

    let body: any
    try {
      body = await req.json()
    } catch {
      return jsonErrorResponse(400, 'Request body must be valid JSON', 'INVALID_JSON')
    }
    const {
      provider: providerRaw = 'openai',
      messages,
      model,
      temperature,
      max_tokens,
      reasoning_effort,
      stream = true,
    } = body

    if (typeof providerRaw !== 'string' || providerRaw.trim().length === 0) {
      return jsonErrorResponse(400, 'Provider is required', 'VALIDATION_ERROR')
    }
    const provider = providerRaw.trim().toLowerCase()
    analyticsProvider = provider
    analyticsModel = typeof model === 'string' && model.trim() ? model : 'default'

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonErrorResponse(400, 'Messages are required', 'VALIDATION_ERROR')
    }

    if (
      reasoning_effort !== undefined &&
      !['off', 'low', 'high', 'max'].includes(reasoning_effort)
    ) {
      return jsonErrorResponse(
        400,
        'reasoning_effort must be one of: off, low, high, max',
        'VALIDATION_ERROR',
      )
    }

    // Resolve adapter from shared provider registry
    const adapter = getProviderAdapter(provider)
    if (!adapter) {
      return jsonErrorResponse(400, `Provider '${provider}' not supported`, 'PROVIDER_UNSUPPORTED')
    }

    const providerConfigs = await getUserProviderConfigs(userId)
    const providerConfig = providerConfigs.find((config: any) => config.provider === provider)
    if (!providerConfig) {
      return jsonErrorResponse(400, `Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED')
    }

    const apiKey = await getUserApiKey(userId, provider)
    if (apiKey === null && isProviderApiKeyRequired(provider)) {
      return jsonErrorResponse(400, `Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED')
    }

    const formatError = validateApiKeyFormat(provider, apiKey ?? '')
    if (formatError) {
      return jsonErrorResponse(
        400,
        'Invalid API key format for the selected provider',
        'PROVIDER_KEY_FORMAT_INVALID',
      )
    }

    // Build adapter config from provider settings
    const settings = providerConfig.settings || {}
    const providerRateLimits = (settings.rateLimits as ProviderRateLimitConfig | undefined) ||
      defaultRateLimits[provider as keyof typeof defaultRateLimits] ||
      { requests: 60, window: 60000 }
    const providerModels = (settings.models as string[] | undefined) ||
      defaultProviderModels[provider as keyof typeof defaultProviderModels] ||
      []
    const resolvedModel = typeof model === 'string' && model.trim()
      ? model
      : providerModels[0]
    analyticsModel = resolvedModel || analyticsModel

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

    const baseUrl = getProviderBaseUrl(provider, settings.baseUrl)
    const extraHeaders: Record<string, string> = {}
    if (provider === 'openrouter') {
      if (settings.httpReferer) extraHeaders['HTTP-Referer'] = settings.httpReferer
      if (settings.xTitle) extraHeaders['X-Title'] = settings.xTitle
    }

    const adapterConfig: ProviderAdapterConfig = { apiKey: apiKey ?? '', baseUrl, extraHeaders }
    const providerRequest: ProviderRequest = {
      messages,
      model: resolvedModel,
      temperature,
      max_tokens,
      reasoning_effort,
      userId,
    }

    if (stream) {
      const streamStart = Date.now()
      const promptTokens = estimatePromptTokens(messages)
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let completionContent = ''
            const generator = adapter.stream(providerRequest, adapterConfig)
            for await (const chunk of generator) {
              completionContent += chunk
              controller.enqueue(new TextEncoder().encode(chunk))
            }

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

            controller.close()
          } catch (error) {
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
            const context = createErrorContext('/api/llm/chat', userId, { provider })
            await errorManager.logError(error as Error, context)
            controller.error(error)
          }
        },
      })
      return new Response(readableStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    } else {
      const requestStart = Date.now()
      const result = await adapter.chat(providerRequest, adapterConfig)

      const promptTokens = estimatePromptTokens(messages)
      const totalTokens = extractTotalTokens(result?.usage, promptTokens)
      const completionTokens = Math.max(0, totalTokens - promptTokens)

      await safeRecordEvent({
        event: 'llm_request',
        userId,
        payload: {
          provider,
          model: analyticsModel,
          stream: false,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          responseTime: Date.now() - requestStart,
        },
      })

      return NextResponse.json(result)
    }
  } catch (error) {
    if (analyticsUserId) {
      await safeRecordEvent({
        event: 'llm_error',
        userId: analyticsUserId,
        payload: {
          provider: analyticsProvider,
          model: analyticsModel,
          message: error instanceof Error ? error.message : 'request_error',
        },
      })
    }
    const context = createErrorContext('/api/llm/chat')
    await errorManager.logError(error as Error, context)
    const mapped = classifyProviderError(error)
    return jsonErrorResponse(
      mapped.status,
      mapped.error,
      mapped.code,
      mapped.retryAfterSeconds,
    )
  }
}
