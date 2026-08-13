/**
 * OpenAI provider adapter.
 *
 * Also used as the base for OpenRouter and Grok (via re-parameterisation in
 * their own adapter modules).
 */

import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ChatCompletion,
} from './types'
import { throwUpstreamError, requireBody, parseSSEStream } from './util'
import { getProviderBaseUrl, providerFetch } from '@/lib/provider-endpoint'

const DEFAULT_MODEL = 'gpt-3.5-turbo'
const TIMEOUT_MS = 60_000

function usesGpt56ChatContract(model: string): boolean {
  return model === 'gpt-5.6' || model.startsWith('gpt-5.6-')
}

function buildChatPayload(request: ProviderRequest, stream: boolean) {
  const model = request.model || DEFAULT_MODEL

  if (usesGpt56ChatContract(model)) {
    return {
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_completion_tokens: request.max_tokens ?? 4096,
      reasoning_effort: 'none',
      stream,
    }
  }

  return {
    model,
    messages: request.messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? 4096,
    stream,
  }
}

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = getProviderBaseUrl('openai', config.baseUrl)
    const response = await providerFetch('openai', `${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwUpstreamError('openai', response, false)
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const baseUrl = getProviderBaseUrl('openai', config.baseUrl)

    const response = await providerFetch('openai', `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify(buildChatPayload(request, false)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('openai', response, false)

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
    const baseUrl = getProviderBaseUrl('openai', config.baseUrl)

    const response = await providerFetch('openai', `${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify(buildChatPayload(request, true)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('openai', response, true)
    const body = requireBody('openai', response)

    yield* parseSSEStream(body, (parsed) => parsed.choices?.[0]?.delta?.content)
  },
}
