/** Official DeepSeek BYOK provider adapter. */

import type {
  ChatCompletion,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
} from './types'
import { parseSSEStream, requireBody } from './util'
import {
  LLMProviderError,
  RateLimitError,
  createErrorContext,
} from '@/lib/error-system'
import { getProviderBaseUrl, providerFetch } from '@/lib/provider-endpoint'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL_IDS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const
export const DEEPSEEK_MODEL_ID = DEEPSEEK_MODEL_IDS[0]
const TIMEOUT_MS = 120_000
const DEFAULT_RETRY_AFTER_MS = 5_000

function resolveModel(model: string | undefined): string {
  const resolvedModel = model || DEEPSEEK_MODEL_ID
  if (!DEEPSEEK_MODEL_IDS.some((modelId) => modelId === resolvedModel)) {
    throw new LLMProviderError(
      'deepseek',
      'HTTP 400: Unsupported DeepSeek model',
      createErrorContext('/api/llm', undefined, { provider: 'deepseek' }),
    )
  }
  return resolvedModel
}

function buildHeaders(apiKey: string): Record<string, string> {
  const normalizedApiKey = apiKey.trim()
  if (!normalizedApiKey) {
    throw new LLMProviderError(
      'deepseek',
      'HTTP 401: DeepSeek API key is required',
      createErrorContext('/api/llm', undefined, { provider: 'deepseek' }),
    )
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${normalizedApiKey}`,
  }
}

function buildPayload(
  request: ProviderRequest,
  stream: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: resolveModel(request.model),
    messages: request.messages,
    stream,
    max_tokens: request.max_tokens ?? 4096,
    temperature: request.temperature ?? 1,
    top_p: 0.95,
  }

  const reasoningEffort = request.reasoning_effort ?? 'high'
  if (reasoningEffort === 'off') {
    payload.thinking = { type: 'disabled' }
  } else {
    payload.thinking = { type: 'enabled' }
    payload.reasoning_effort = reasoningEffort
  }

  return payload
}

function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number {
  if (!value) return DEFAULT_RETRY_AFTER_MS

  const normalized = value.trim()
  if (/^\d+$/.test(normalized)) {
    const delaySeconds = Number(normalized)
    return Number.isSafeInteger(delaySeconds)
      ? Math.max(1, delaySeconds) * 1000
      : DEFAULT_RETRY_AFTER_MS
  }

  const retryAtMs = Date.parse(normalized)
  if (Number.isFinite(retryAtMs)) {
    return Math.max(1_000, retryAtMs - nowMs)
  }

  return DEFAULT_RETRY_AFTER_MS
}

async function throwDeepSeekError(
  response: Response,
  streaming: boolean,
): Promise<never> {
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(
      response.headers.get('retry-after'),
    )

    throw new RateLimitError(
      'HTTP 429: DeepSeek API rate limit reached',
      retryAfterMs,
      createErrorContext('/api/llm', undefined, {
        provider: 'deepseek',
        streaming,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      }),
    )
  }

  throw new LLMProviderError(
    'deepseek',
    `HTTP ${response.status}`,
    createErrorContext('/api/llm', undefined, {
      provider: 'deepseek',
      streaming,
    }),
  )
}

export const deepseekAdapter: ProviderAdapter = {
  id: 'deepseek',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = getProviderBaseUrl('deepseek', config.baseUrl)
    const response = await providerFetch('deepseek', `${baseUrl}/models`, {
      method: 'GET',
      headers: buildHeaders(config.apiKey),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwDeepSeekError(response, false)
    }

    const data = await response.json().catch(() => null)
    const models = Array.isArray(data?.data) ? data.data : null
    const advertisedModelIds = new Set(
      models
        ?.map((model: unknown) =>
          typeof model === 'object' && model !== null && 'id' in model
            ? model.id
            : null,
        )
        .filter((modelId: unknown): modelId is string =>
          typeof modelId === 'string',
        ) ?? [],
    )
    const missingModelIds = DEEPSEEK_MODEL_IDS.filter(
      (modelId) => !advertisedModelIds.has(modelId),
    )
    if (missingModelIds.length > 0) {
      throw new SyntaxError(
        `DeepSeek API does not advertise: ${missingModelIds.join(', ')}`,
      )
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const baseUrl = getProviderBaseUrl('deepseek', config.baseUrl)
    const response = await providerFetch(
      'deepseek',
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(config.apiKey),
        body: JSON.stringify(buildPayload(request, false)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )

    if (!response.ok) await throwDeepSeekError(response, false)

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new SyntaxError('DeepSeek returned malformed response')
    }

    return {
      content,
      finish_reason: data.choices?.[0]?.finish_reason ?? 'stop',
      usage: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: data.usage.completion_tokens ?? 0,
            total_tokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
    }
  },

  async *stream(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined> {
    const baseUrl = getProviderBaseUrl('deepseek', config.baseUrl)
    const response = await providerFetch(
      'deepseek',
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(config.apiKey),
        body: JSON.stringify(buildPayload(request, true)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )

    if (!response.ok) await throwDeepSeekError(response, true)
    const body = requireBody('deepseek', response)

    // reasoning_content is private model work; only final content is rendered.
    yield* parseSSEStream(
      body,
      (parsed) => parsed.choices?.[0]?.delta?.content,
    )
  },
}
