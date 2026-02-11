/**
 * Anthropic (Claude) provider adapter.
 */

import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ChatCompletion,
} from './types'
import { throwUpstreamError, requireBody, parseSSEStream } from './util'

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_MODEL = 'claude-3-sonnet-20240229'
const ANTHROPIC_VERSION = '2023-06-01'
const TIMEOUT_MS = 60_000

function buildAnthropicPayload(request: ProviderRequest, stream: boolean) {
  const systemMessage = request.messages.find((m) => m.role === 'system')
  const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')
  return {
    body: {
      model: request.model || DEFAULT_MODEL,
      messages: nonSystemMessages,
      system: systemMessage?.content,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      ...(stream ? { stream: true } : {}),
    },
  }
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...config.extraHeaders,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwUpstreamError('anthropic', response, false)
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const { body } = buildAnthropicPayload(request, false)

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('anthropic', response, false)

    const data = await response.json()
    return {
      content: data.content[0]?.text || '',
      finish_reason: data.stop_reason,
      usage: {
        prompt_tokens: data.usage?.input_tokens,
        completion_tokens: data.usage?.output_tokens,
        total_tokens:
          (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    }
  },

  async *stream(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL
    const { body } = buildAnthropicPayload(request, true)

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('anthropic', response, true)
    const streamBody = requireBody('anthropic', response)

    yield* parseSSEStream(streamBody, (parsed) => {
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return parsed.delta.text
      }
      return undefined
    })
  },
}
