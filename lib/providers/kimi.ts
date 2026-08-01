/**
 * Kimi (Moonshot AI) provider adapter.
 *
 * Kimi exposes an OpenAI-compatible Chat Completions API. Current Kimi
 * models use fixed sampling parameters, so this adapter intentionally omits
 * temperature, top_p, penalties, and n even when callers provide them.
 */

import type {
  ChatCompletion,
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
} from './types'
import { parseSSEStream, requireBody, throwUpstreamError } from './util'

const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1'
const DEFAULT_MODEL = 'kimi-k3'
const TIMEOUT_MS = 120_000

function buildHeaders(config: ProviderAdapterConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    ...config.extraHeaders,
  }
}

function buildPayload(
  request: ProviderRequest,
  stream: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: request.model || DEFAULT_MODEL,
    messages: request.messages,
    stream,
  }

  if (request.max_tokens !== undefined) {
    payload.max_completion_tokens = request.max_tokens
  }

  return payload
}

export const kimiAdapter: ProviderAdapter = {
  id: 'kimi',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildHeaders(config),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwUpstreamError('kimi', response, false)
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify(buildPayload(request, false)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('kimi', response, false)

    const data = await response.json()
    return {
      content: data.choices?.[0]?.message?.content || '',
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
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify(buildPayload(request, true)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('kimi', response, true)
    const body = requireBody('kimi', response)

    // Kimi sends reasoning_content separately. Only user-visible final content
    // is forwarded to the product stream.
    yield* parseSSEStream(
      body,
      (parsed) => parsed.choices?.[0]?.delta?.content,
    )
  },
}
