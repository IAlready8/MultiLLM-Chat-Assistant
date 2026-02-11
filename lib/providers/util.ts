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
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder
        .decode(value, { stream: true })
        .split('\n')
        .filter((line) => line.trim() !== '')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          try {
            const content = extractContent(JSON.parse(data))
            if (content) yield content
          } catch {
            /* Ignore malformed JSON lines */
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
