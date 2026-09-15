/**
 * Shared utilities for provider adapters.
 */

import type { ProviderUsage } from './types'
import { LlmRequestError } from '@/lib/llm-request'
import { LLMProviderError, createErrorContext } from '@/lib/error-system'

/** Extract a human-readable error message from an upstream provider response. */
export async function getUpstreamErrorMessage(response: Response): Promise<string> {
  await response.body?.cancel().catch(() => undefined)
  return `HTTP ${response.status}`
}

/** Throw an LLMProviderError for a non-ok upstream response. */
export async function throwUpstreamError(
  provider: string,
  response: Response,
  streaming: boolean,
): Promise<never> {
  const message = await getUpstreamErrorMessage(response)
  throw new LLMProviderError(
    provider,
    message,
    createErrorContext('/api/llm', undefined, { streaming }),
  )
}

/** Guard that response.body exists and throw if it doesn't. */
export function requireBody(provider: string, response: Response): ReadableStream<Uint8Array> {
  if (!response.body) {
    throw new LLMProviderError(
      provider,
      'No response body received',
      createErrorContext('/api/llm', undefined),
    )
  }
  return response.body
}

/**
 * Parse an SSE text stream into yielded text chunks.
 * Handles the common `data: ...` / `data: [DONE]` pattern used by
 * OpenAI-compatible and Anthropic endpoints.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  extractContent: (parsed: any) => string | undefined,
  onUsage?: (usage: ProviderUsage) => void,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []
  let complete = false

  const parseEvent = (): string | undefined | null => {
    if (!dataLines.length) return undefined
    const data = dataLines.join('\n')
    dataLines = []
    if (data.trim() === '[DONE]') { complete = true; return null }
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('Malformed provider event')
    if (parsed.error || parsed.type === 'error') {
      throw new LlmRequestError('Provider stream failed', 503, 'PROVIDER_UNAVAILABLE')
    }
    if (parsed.type === 'message_stop' || parsed.choices?.[0]?.finish_reason || parsed.candidates?.[0]?.finishReason) complete = true
    if (parsed.usage) onUsage?.(parsed.usage)
    const content = extractContent(parsed)
    if (content !== undefined && typeof content !== 'string') throw new SyntaxError('Malformed provider content')
    return content
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (buffer.length + dataLines.reduce((size, line) => size + line.length, 0) > 1_048_576) throw new SyntaxError('Provider stream frame is too large')
      const lines = buffer.split('\n')
      buffer = done ? '' : lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
        if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
        if (line === '') {
          const content = parseEvent()
          if (content === null) return
          if (content) yield content
        }
      }
      if (done) break
    }
    const content = parseEvent()
    if (content) yield content
    if (!complete) throw new LlmRequestError('Provider connection ended before completion', 502, 'PROVIDER_STREAM_INTERRUPTED')
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export function providerSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
