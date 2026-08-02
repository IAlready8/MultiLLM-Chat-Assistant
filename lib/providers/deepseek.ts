/**
 * DeepSeek V4 Flash community provider adapter.
 *
 * This is a shared, public, community-operated Hugging Face endpoint. It is
 * OpenAI Chat Completions compatible and requires no credential. Do not send
 * private or sensitive data to it.
 */

import type {
  ChatCompletion,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
} from './types'
import { parseSSEStream, requireBody, throwUpstreamError } from './util'
import { RateLimitError, createErrorContext } from '@/lib/error-system'

export const DEEPSEEK_BASE_URL =
  'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1'
export const DEEPSEEK_MODEL_ID = 'deepseek-ai/DeepSeek-V4-Flash-0731'
const TIMEOUT_MS = 120_000
const DEFAULT_RETRY_AFTER_MS = 5_000

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  }
}

function buildPayload(
  request: ProviderRequest,
  stream: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: request.model || DEEPSEEK_MODEL_ID,
    messages: request.messages,
    stream,
    max_tokens: request.max_tokens ?? 4096,
    temperature: request.temperature ?? 1,
    top_p: 0.95,
  }

  // The community deployment treats an omitted field as non-reasoning mode.
  // Preserve the existing high-effort default unless callers explicitly opt out.
  if (request.reasoning_effort !== 'off') {
    payload.reasoning_effort = request.reasoning_effort ?? 'high'
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
      'HTTP 429: DeepSeek community endpoint rate limit reached',
      retryAfterMs,
      createErrorContext('/api/llm', undefined, {
        provider: 'deepseek',
        streaming,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      }),
    )
  }

  return await throwUpstreamError('deepseek', response, streaming)
}

export const deepseekAdapter: ProviderAdapter = {
  id: 'deepseek',

  async testConnection(_config: ProviderAdapterConfig): Promise<void> {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/models`, {
      method: 'GET',
      headers: buildHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwDeepSeekError(response, false)
    }

    const data = await response.json().catch(() => null)
    const models = Array.isArray(data?.data) ? data.data : null
    if (
      !models ||
      !models.some((model: unknown) =>
        typeof model === 'object' &&
        model !== null &&
        'id' in model &&
        model.id === DEEPSEEK_MODEL_ID
      )
    ) {
      throw new SyntaxError(
        `DeepSeek community endpoint does not advertise ${DEEPSEEK_MODEL_ID}`,
      )
    }
  },

  async chat(
    request: ProviderRequest,
    _config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const response = await fetch(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(),
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
    _config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined> {
    const response = await fetch(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(),
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
