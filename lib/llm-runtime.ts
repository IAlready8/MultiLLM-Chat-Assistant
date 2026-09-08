import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'
import { validateApiKeyFormat } from '@/lib/provider-key-test'
import { getProviderDisabledMessage, isProviderApiKeyRequired, isProviderDisabled, PROVIDER_DISABLED_ERROR_CODE } from '@/lib/provider-registry'
import { checkProviderRateLimit, type ProviderRateLimitConfig } from '@/lib/provider-rate-limit'
import { getProviderAdapter, classifyProviderError } from '@/lib/providers'
import { getProviderBaseUrl } from '@/lib/provider-endpoint'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { LlmRequestError, type LlmInput } from '@/lib/llm-request'
import type { ProviderRequest, ProviderUsage } from '@/lib/providers'

export async function prepareProviderCall(userId: string, input: LlmInput, signal?: AbortSignal) {
  const { provider } = input
  signal?.throwIfAborted()
  if (isProviderDisabled(provider)) {
    throw new LlmRequestError(getProviderDisabledMessage(provider), 503, PROVIDER_DISABLED_ERROR_CODE)
  }
  const adapter = getProviderAdapter(provider)
  if (!adapter) throw new LlmRequestError(`Provider '${provider}' not supported`, 400, 'PROVIDER_UNSUPPORTED')
  const [configs, apiKey] = await Promise.all([
    getUserProviderConfigs(userId), getUserApiKey(userId, provider),
  ])
  const config = configs.find(item => item.provider === provider)
  if (!config || (apiKey === null && isProviderApiKeyRequired(provider))) {
    throw new LlmRequestError(`Provider ${provider} is not configured`, 400, 'PROVIDER_NOT_CONFIGURED')
  }
  if (validateApiKeyFormat(provider, apiKey ?? '')) {
    throw new LlmRequestError('Invalid API key format for the selected provider', 400, 'PROVIDER_KEY_FORMAT_INVALID')
  }
  const settings = config.settings || {}
  const baseUrl = getProviderBaseUrl(provider, settings.baseUrl)
  const rateConfig = settings.rateLimits as ProviderRateLimitConfig | undefined
  const rateLimit = await checkProviderRateLimit(userId, provider, rateConfig || defaultRateLimits[provider as keyof typeof defaultRateLimits] || { requests: 60, window: 60000 })
  if (!rateLimit.allowed) {
    throw new LlmRequestError('Rate limit exceeded', 429, 'RATE_LIMITED', Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)))
  }
  const models = settings.models as string[] | undefined
  const model = input.model || models?.[0] || defaultProviderModels[provider as keyof typeof defaultProviderModels]?.[0]
  const extraHeaders: Record<string, string> = {}
  if (provider === 'openrouter') {
    if (settings.httpReferer) extraHeaders['HTTP-Referer'] = settings.httpReferer
    if (settings.xTitle) extraHeaders['X-Title'] = settings.xTitle
  }
  const request: ProviderRequest = { messages: input.messages, model, temperature: input.temperature, max_tokens: input.max_tokens, reasoning_effort: input.reasoning_effort, userId, signal }
  signal?.throwIfAborted()
  return { adapter, config: { apiKey: apiKey ?? '', baseUrl, extraHeaders }, request }
}

export function resolveUsage(messages: ProviderRequest['messages'], content: string, usage?: ProviderUsage) {
  const valid = usage && [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647)
  if (valid && usage.total_tokens > 0 && usage.total_tokens >= usage.prompt_tokens + usage.completion_tokens) return { ...usage, usage_source: 'provider' as const }
  const prompt_tokens = Math.max(1, Math.ceil(messages.reduce((sum, item) => sum + item.content.length, 0) / 4))
  const completion_tokens = Math.ceil(content.length / 4)
  return { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens, usage_source: 'estimated' as const }
}

export async function recordLlmEvent(userId: string, event: string, payload: Record<string, unknown>) {
  try {
    await recordAnalyticsEvent({ userId, event, payload })
  } catch {
    console.warn('LLM analytics persistence failed', { event })
  }
}

export async function executeChat(userId: string, input: LlmInput, signal?: AbortSignal) {
  const startedAt = Date.now()
  const call = await prepareProviderCall(userId, input, signal)
  try {
    const result = await call.adapter.chat(call.request, call.config)
    if (typeof result.content !== 'string' || !result.content.trim()) throw new LlmRequestError('Provider returned an empty response', 502, 'PROVIDER_EMPTY_RESPONSE')
    const usage = resolveUsage(input.messages, result.content, result.usage)
    await recordLlmEvent(userId, 'llm_request', { provider: input.provider, model: call.request.model, stream: false, ...usage, responseTime: Date.now() - startedAt })
    return { ...result, usage, usage_source: usage.usage_source }
  } catch (error) {
    await recordLlmEvent(userId, 'llm_error', { provider: input.provider, model: call.request.model, code: classifyProviderError(error).code, responseTime: Date.now() - startedAt })
    throw error
  }
}

export function llmErrorResponse(error: unknown): Response {
  const mapped = classifyProviderError(error)
  return Response.json({ error: mapped.error, code: mapped.code }, { status: mapped.status, headers: { 'Cache-Control': 'no-store', ...(mapped.retryAfterSeconds ? { 'Retry-After': String(mapped.retryAfterSeconds) } : {}) } })
}

export function createCompletionStream(call: Awaited<ReturnType<typeof prepareProviderCall>>, provider: string, userId: string, controller: AbortController, ndjson: boolean, persistence?: {
  finish: (content: string, status: 'complete' | 'failed' | 'canceled', usage: ReturnType<typeof resolveUsage>) => Promise<void>
  settled: () => void
}) {
  const encoder = new TextEncoder()
  const startedAt = Date.now()
  let disconnected = false
  let providerUsage: ProviderUsage | undefined
  call.request.onUsage = usage => {
    if (usage && [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)) providerUsage = usage
  }
  return new ReadableStream<Uint8Array>({
    async start(output) {
      let content = ''
      try {
        for await (const chunk of call.adapter.stream(call.request, call.config)) {
          if (disconnected) break
          controller.signal.throwIfAborted()
          content += chunk
          if (content.length > 1_048_576) throw new LlmRequestError('Provider response exceeded the size limit', 502, 'PROVIDER_RESPONSE_TOO_LARGE')
          output.enqueue(encoder.encode(ndjson ? JSON.stringify({ type: 'chunk', content: chunk }) + '\n' : chunk))
        }
        controller.signal.throwIfAborted()
        call.request.signal?.throwIfAborted()
        if (!content.trim()) throw new LlmRequestError('Provider returned an empty response', 502, 'PROVIDER_EMPTY_RESPONSE')
        const usage = resolveUsage(call.request.messages, content, providerUsage)
        await persistence?.finish(content, 'complete', usage)
        await recordLlmEvent(userId, 'llm_request', { provider, model: call.request.model, stream: true, ...usage, responseTime: Date.now() - startedAt })
        if (!disconnected && ndjson) output.enqueue(encoder.encode(JSON.stringify({ type: 'done', usage }) + '\n'))
      } catch (error) {
        const mapped = classifyProviderError(error)
        const canceled = disconnected || controller.signal.aborted || (call.request.signal?.aborted && call.request.signal.reason?.name !== 'TimeoutError')
        try {
          await persistence?.finish(content, canceled ? 'canceled' : 'failed', resolveUsage(call.request.messages, content, providerUsage))
        } catch {
          console.error('Generation persistence failed')
        }
        await recordLlmEvent(userId, canceled ? 'llm_aborted' : 'llm_error', { provider, model: call.request.model, code: mapped.code, responseTime: Date.now() - startedAt })
        if (!disconnected) {
          if (ndjson) output.enqueue(encoder.encode(JSON.stringify({ type: 'error', error: mapped.error, code: mapped.code, retryAfterSeconds: mapped.retryAfterSeconds }) + '\n'))
          else { output.error(new Error(mapped.error)); disconnected = true }
        }
      } finally {
        if (!disconnected) output.close()
        persistence?.settled()
      }
    },
    cancel() {
      disconnected = true
      controller.abort()
    },
  })
}
