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

const DEFAULT_BASE_URL =
  'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1'
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
const TIMEOUT_MS = 120_000

function buildHeaders(config: ProviderAdapterConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...config.extraHeaders,
  }
}

function buildPayload(
  request: ProviderRequest,
  stream: boolean,
): Record<string, unknown> {
  return {
    model: request.model || DEFAULT_MODEL,
    messages: request.messages,
    stream,
    max_tokens: request.max_tokens ?? 4096,
    reasoning_effort: 'high',
    temperature: request.temperature ?? 1,
    top_p: 0.95,
  }
}

async function throwDeepSeekError(
  response: Response,
  streaming: boolean,
): Promise<never> {
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('retry-after')
    const retryAfterSeconds = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10)
      : Number.NaN
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(1, retryAfterSeconds) * 1000
      : 5_000

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

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const response = await fetch(`${DEFAULT_BASE_URL}/models`, {
      method: 'GET',
      headers: buildHeaders(config),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwDeepSeekError(response, false)
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const response = await fetch(
      `${DEFAULT_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(config),
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
    const response = await fetch(
      `${DEFAULT_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(config),
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
