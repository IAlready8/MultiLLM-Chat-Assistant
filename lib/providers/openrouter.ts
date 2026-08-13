/**
 * OpenRouter provider adapter.
 *
 * OpenRouter is API-compatible with OpenAI but uses a different base URL and
 * default model.  It delegates to the same OpenAI-style request/response shape.
 */

import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ChatCompletion,
} from './types'
import { throwUpstreamError, requireBody, parseSSEStream } from './util'
import { getProviderBaseUrl, providerFetch } from '@/lib/provider-endpoint'

const DEFAULT_MODEL = 'openrouter/auto'
const TIMEOUT_MS = 60_000

export const openrouterAdapter: ProviderAdapter = {
  id: 'openrouter',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = getProviderBaseUrl('openrouter', config.baseUrl)
    const response = await providerFetch('openrouter', `${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwUpstreamError('openrouter', response, false)
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const baseUrl = getProviderBaseUrl('openrouter', config.baseUrl)
    const model = request.model || DEFAULT_MODEL

    const response = await providerFetch('openrouter', `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 4096,
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('openrouter', response, false)

    const data = await response.json()
    return {
      content: data.choices?.[0]?.message?.content || '',
      finish_reason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
    }
  },

  async *stream(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined> {
    const baseUrl = getProviderBaseUrl('openrouter', config.baseUrl)
    const model = request.model || DEFAULT_MODEL

    const response = await providerFetch('openrouter', `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 4096,
        stream: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('openrouter', response, true)
    const body = requireBody('openrouter', response)

    yield* parseSSEStream(body, (parsed) => parsed.choices?.[0]?.delta?.content)
  },
}
