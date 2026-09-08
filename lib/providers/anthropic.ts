import { isModernClaude } from '@/lib/model-contract'
import { providerSignal } from './util'
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
import { getProviderBaseUrl, providerFetch } from '@/lib/provider-endpoint'

const DEFAULT_MODEL = 'claude-3-sonnet-20240229'
const ANTHROPIC_VERSION = '2023-06-01'
const TIMEOUT_MS = 60_000

function buildAnthropicPayload(request: ProviderRequest, stream: boolean) {
  const system = request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const nonSystemMessages = request.messages.filter((m) => m.role !== 'system')
  return {
    body: {
      model: request.model || DEFAULT_MODEL,
      messages: nonSystemMessages,
      system: system || undefined,
      ...(!isModernClaude(request.model ?? DEFAULT_MODEL) ? { temperature: request.temperature ?? 0.7 } : {}),
      max_tokens: request.max_tokens ?? 4096,
      ...(stream ? { stream: true } : {}),
    },
  }
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = getProviderBaseUrl('anthropic', config.baseUrl)
    const response = await providerFetch('anthropic', `${baseUrl}/v1/models`, {
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
    const baseUrl = getProviderBaseUrl('anthropic', config.baseUrl)
    const { body } = buildAnthropicPayload(request, false)

    const response = await providerFetch('anthropic', `${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: providerSignal(request.signal, TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('anthropic', response, false)

    const data = await response.json()
    return {
      content: Array.isArray(data.content) ? data.content.filter((block: { type?: string; text?: unknown }) => block.type === 'text' && typeof block.text === 'string').map((block: { text: string }) => block.text).join('') : '',
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
    const baseUrl = getProviderBaseUrl('anthropic', config.baseUrl)
    const { body } = buildAnthropicPayload(request, true)

    const response = await providerFetch('anthropic', `${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: providerSignal(request.signal, TIMEOUT_MS),
    })

    if (!response.ok) await throwUpstreamError('anthropic', response, true)
    const streamBody = requireBody('anthropic', response)

    let inputTokens: number | undefined
    yield* parseSSEStream(streamBody, (parsed) => {
      if (parsed.type === 'message_start' && parsed.message?.usage) {
        const usage = parsed.message.usage
        inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
      }
      if (parsed.type === 'message_delta' && inputTokens !== undefined && typeof parsed.usage?.output_tokens === 'number') {
        request.onUsage?.({ prompt_tokens: inputTokens, completion_tokens: parsed.usage.output_tokens, total_tokens: inputTokens + parsed.usage.output_tokens })
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        return parsed.delta.text
      }
      return undefined
    })
  },
}
