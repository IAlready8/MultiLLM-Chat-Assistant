/**
 * lib/providers/ollama.ts
 *
 * Ollama local model adapter.
 *
 * Ollama runs a local HTTP server (default: http://localhost:11434) that
 * exposes an OpenAI-compatible /api/chat endpoint and a native /api/generate
 * endpoint. This adapter uses /api/chat (the multi-turn compatible surface)
 * for both chat and stream methods, matching what the OpenAI-compatible
 * path exposes.
 *
 * No API key is required. The apiKey field in ProviderAdapterConfig is
 * accepted but ignored. Custom remote Ollama endpoints are intentionally not
 * supported by this adapter.
 *
 * testConnection() calls GET /api/tags, which returns the list of locally
 * pulled models. It throws if Ollama is not running or unreachable. This
 * gives the settings page a fast connectivity probe without generating
 * billable completions (there are none - Ollama is free).
 *
 * Stream parsing: Ollama /api/chat with stream:true emits newline-delimited
 * JSON objects (NDJSON), not SSE. Each line is a JSON object with a
 * "message" field containing "content". When "done" is true the stream ends.
 * This is different from OpenAI SSE - we handle it with a dedicated parser.
 */

import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderRequest,
  ChatCompletion,
} from './types'
import { LLMProviderError, createErrorContext } from '@/lib/error-system'
import {
  getProviderBaseUrl,
  providerFetch,
  ProviderEndpointError,
} from '@/lib/provider-endpoint'

const DEFAULT_MODEL = 'llama3'
const TIMEOUT_MS = 120_000 // Local inference can be slow on CPU

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(config: ProviderAdapterConfig): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  // Accept an optional bearer token for remote Ollama instances behind auth
  if (config.apiKey && config.apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  if (config.extraHeaders) {
    Object.assign(headers, config.extraHeaders)
  }
  return headers
}

function buildChatPayload(
  request: ProviderRequest,
  stream: boolean,
): Record<string, unknown> {
  return {
    model: request.model || DEFAULT_MODEL,
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    stream,
    options: {
      temperature: request.temperature ?? 0.7,
      num_predict: request.max_tokens ?? 4096,
    },
  }
}

async function throwOllamaError(
  label: string,
  response: Response,
): Promise<never> {
  let detail = `HTTP ${response.status}`
  try {
    const body = await response.json()
    if (typeof body?.error === 'string') detail = `HTTP ${response.status}: ${body.error}`
  } catch {
    // ignore parse failure
  }
  throw new LLMProviderError(
    'ollama',
    detail,
    createErrorContext(label, undefined, { status: response.status }),
  )
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const ollamaAdapter: ProviderAdapter = {
  id: 'ollama',

  /**
   * Probe connectivity by listing locally pulled models.
   * GET /api/tags returns { models: [{name, ...}] } when Ollama is running.
   */
  async testConnection(config: ProviderAdapterConfig): Promise<void> {
    const baseUrl = getProviderBaseUrl('ollama', config.baseUrl)
    let response: Response
    try {
      response = await providerFetch('ollama', `${baseUrl}/api/tags`, {
        method: 'GET',
        headers: buildHeaders(config),
        signal: AbortSignal.timeout(10_000),
      }, { baseUrl })
    } catch (err: unknown) {
      if (err instanceof ProviderEndpointError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new LLMProviderError(
        'ollama',
        `Could not reach Ollama at ${baseUrl} - is it running? (${msg})`,
        createErrorContext('/api/tags', undefined),
      )
    }
    if (!response.ok) await throwOllamaError('/api/tags', response)
  },

  /**
   * Non-streaming chat completion via POST /api/chat with stream:false.
   * Ollama returns a single JSON object with a "message" field.
   */
  async chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion> {
    const baseUrl = getProviderBaseUrl('ollama', config.baseUrl)
    const payload = buildChatPayload(request, false)

    let response: Response
    try {
      response = await providerFetch('ollama', `${baseUrl}/api/chat`, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }, { baseUrl })
    } catch (err: unknown) {
      if (err instanceof ProviderEndpointError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new LLMProviderError(
        'ollama',
        `Ollama request failed: ${msg}`,
        createErrorContext('/api/chat', undefined),
      )
    }

    if (!response.ok) await throwOllamaError('/api/chat', response)

    const data = await response.json()
    const content: string = data?.message?.content || ''
    const promptTokens: number = data?.prompt_eval_count ?? 0
    const completionTokens: number = data?.eval_count ?? 0

    return {
      content,
      finish_reason: data?.done ? 'stop' : 'length',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    }
  },

  /**
   * Streaming chat via POST /api/chat with stream:true.
   *
   * Ollama streams NDJSON - one JSON object per line, not SSE.
   * Each line looks like:
   *   {"model":"llama3","message":{"role":"assistant","content":"Hello"},"done":false}
   *
   * The final line has "done":true and may include eval stats.
   * We yield message.content from each non-done line.
   */
  async *stream(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined> {
    const baseUrl = getProviderBaseUrl('ollama', config.baseUrl)
    const payload = buildChatPayload(request, true)

    let response: Response
    try {
      response = await providerFetch('ollama', `${baseUrl}/api/chat`, {
        method: 'POST',
        headers: buildHeaders(config),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }, { baseUrl })
    } catch (err: unknown) {
      if (err instanceof ProviderEndpointError) throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new LLMProviderError(
        'ollama',
        `Ollama stream request failed: ${msg}`,
        createErrorContext('/api/chat stream', undefined),
      )
    }

    if (!response.ok) await throwOllamaError('/api/chat stream', response)

    if (!response.body) {
      throw new LLMProviderError(
        'ollama',
        'No response body received from Ollama',
        createErrorContext('/api/chat stream', undefined),
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const obj = JSON.parse(trimmed)
            const chunk: string = obj?.message?.content ?? ''
            if (chunk) yield chunk
            if (obj?.done === true) return
          } catch {
            // Ignore malformed NDJSON lines
          }
        }
      }

      // Flush any remaining buffer content
      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer.trim())
          const chunk: string = obj?.message?.content ?? ''
          if (chunk) yield chunk
        } catch {
          // Ignore
        }
      }
    } finally {
      reader.releaseLock()
    }
  },
}
