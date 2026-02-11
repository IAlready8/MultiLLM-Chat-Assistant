/**
 * Google AI (Gemini) provider adapter.
 *
 * Google AI uses a different request/response shape and SSE format than
 * OpenAI-compatible providers.  The API key is passed as a query parameter.
 */

import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ChatCompletion,
  ProviderMessage,
} from './types'
import { throwUpstreamError, requireBody, parseSSEStream } from './util'

const DEFAULT_MODEL = 'gemini-1.5-flash'
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS = 60_000

function buildGeminiPayload(messages: ProviderMessage[], request: ProviderRequest) {
  const systemInstruction = messages.find((m) => m.role === 'system')?.content
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  return {
    contents,
    systemInstruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.max_tokens ?? 4096,
    },
  }
}

export const googleaiAdapter: ProviderAdapter = {
  id: 'googleai',

  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const response = await fetch(`${BASE_URL}/models?key=${config.apiKey}`, {
      method: 'GET',
      headers: {
        ...config.extraHeaders,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      await throwUpstreamError('googleai', response, false)
    }
  },

  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const model = request.model || DEFAULT_MODEL
    const payload = buildGeminiPayload(request.messages, request)

    const response = await fetch(
      `${BASE_URL}/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...config.extraHeaders },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )

    if (!response.ok) await throwUpstreamError('googleai', response, false)

    const data = await response.json()
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      finish_reason: data.candidates?.[0]?.finishReason || 'stop',
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    }
  },

  async *stream(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined> {
    const model = request.model || DEFAULT_MODEL
    const payload = buildGeminiPayload(request.messages, request)

    // BUG FIX: Added AbortSignal.timeout that was previously missing for
    // Google AI streaming, which could hang indefinitely on network issues.
    const response = await fetch(
      `${BASE_URL}/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...config.extraHeaders },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )

    if (!response.ok) await throwUpstreamError('googleai', response, true)
    const body = requireBody('googleai', response)

    yield* parseSSEStream(
      body,
      (parsed) => parsed.candidates?.[0]?.content?.parts?.[0]?.text,
    )
  },
}
