/**
 * Shared utilities for provider adapters.
 */

import { LLMProviderError, createErrorContext } from '@/lib/error-system'

/** Extract a human-readable error message from an upstream provider response. */
export async function getUpstreamErrorMessage(response: Response): Promise<string> {
  const errorBody = await response.json().catch(() => ({} as Record<string, unknown>))
  const detail =
    (errorBody as any)?.error?.message ||
    (errorBody as any)?.message ||
    (errorBody as any)?.detail
  return detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`
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
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const parseLine = (line: string): string | undefined | null => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
    if (!normalized.startsWith('data:')) return undefined

    const data = normalized.slice(5).trimStart()
    if (data === '[DONE]') return null

    try {
      return extractContent(JSON.parse(data))
    } catch {
      return undefined
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const content = parseLine(line)
        if (content === null) return
        if (content) yield content
      }
    }

    buffer += decoder.decode()
    if (buffer) {
      const content = parseLine(buffer)
      if (content === null) return
      if (content) yield content
    }
  } finally {
    reader.releaseLock()
  }
}
