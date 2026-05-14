/**
 * lib/providers/mistral.ts
 *
 * Mistral AI (La Plateforme) provider adapter.
 *
 * Mistral's API at https://api.mistral.ai/v1 is wire-compatible with the
 * OpenAI chat completions format. This means the request and response shapes
 * for /chat/completions and SSE streaming are identical to OpenAI, including
 * the "data: [DONE]" terminator. We reuse parseSSEStream and throwUpstreamError
 * from util.ts exactly as openai.ts does.
 *
 * Supported models (as of 2026-Q1):
 *   mistral-tiny          - fastest, lowest cost (deprecated upstream - kept for compat)
 *   mistral-small-latest  - balanced cost/quality
 *   mistral-medium-latest - mid-tier
 *   mistral-large-latest  - flagship reasoning model
 *   open-mistral-7b       - open-weights 7B
 *   open-mixtral-8x7b     - MoE 8x7B (Mixtral)
 *   open-mixtral-8x22b    - MoE 8x22B
 *   codestral-latest      - code-specialized model
 *   mistral-embed         - embeddings only (not used for chat)
 *
 * testConnection() calls GET /v1/models which is a no-billable-usage probe.
 *
 * Auth: Bearer token in Authorization header. Get your key at
 *   https://console.mistral.ai/api-keys
 */

import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ChatCompletion,
} from './types'
import { throwUpstreamError, requireBody, parseSSEStream } from './util'

const DEFAULT_BASE_URL = 'https://api.mistral.ai/v1'
const DEFAULT_MODEL = 'mistral-small-latest'
const TIMEOUT_MS = 60_000

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
  return {
    model: request.model || DEFAULT_MODEL,
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? 4096,
    stream,
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const mistralAdapter: ProviderAdapter = {
  id: 'mistral',

  /**
   * Probe connectivity without generating billable completions.
   * GET /v1/models returns the list of available models when the key is valid.
   */
  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: buildHeaders(config),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      await throwUpstreamError('mistral', response, false)
    }
  },

  /**
   * Non-streaming chat completion.
   * POST /v1/chat/completions with stream:false.
   * Response shape is identical to OpenAI - choices[0].message.content.
   */
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

    if (!response.ok) await throwUpstreamError('mistral', response, false)

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

  /**
   * Streaming chat via SSE.
   * POST /v1/chat/completions with stream:true.
   *
   * Mistral SSE format is identical to OpenAI:
   *   data: {"id":"...","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
   *   data: [DONE]
   *
   * parseSSEStream from util.ts handles this without modification.
   */
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

    if (!response.ok) await throwUpstreamError('mistral', response, true)
    const body = requireBody('mistral', response)

    yield* parseSSEStream(
      body,
      (parsed) => parsed.choices?.[0]?.delta?.content,
    )
  },
}
