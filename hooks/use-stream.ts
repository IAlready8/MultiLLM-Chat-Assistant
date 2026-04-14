"use client"

/**
 * hooks/use-stream.ts
 *
 * React hook that wraps the streaming chat API (/api/llm/stream) and manages
 * all streaming state internally. Replaces the inline AbortController +
 * chunk-parsing state machines duplicated across multi-chat, ai-roundtable,
 * and comparison pages.
 *
 * Uses services/stream-client.ts for the actual HTTP layer so that the NDJSON
 * parsing contract stays in one place.
 *
 * Usage:
 *   const { content, isStreaming, error, start, abort, reset } = useStream()
 *
 *   // Start a stream
 *   await start({
 *     provider: 'openai',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *     model: 'gpt-4o',
 *     temperature: 0.7,
 *     maxTokens: 2048,
 *     onChunk: (chunk) => ...,  // optional - called per chunk in addition to state update
 *     onDone: (full) => ...,    // optional - called with the full accumulated content
 *     onError: (err) => ...,    // optional - called on error
 *   })
 *
 *   // Abort in-flight stream
 *   abort()
 *
 *   // Clear accumulated content and error
 *   reset()
 *
 * All callbacks are optional. The hook accumulates content in state regardless
 * so callers can read it from the return value without callbacks.
 *
 * isStreaming is true from the moment start() is called until done/error/abort.
 * error is null during successful streams and set on failure or abort.
 * content accumulates chunks and is NOT reset between calls to start() unless
 * reset() is called explicitly. This allows append behavior for multi-turn pages.
 */

import { useCallback, useRef, useState } from 'react'
import {
  streamChat,
  type ChatMessage,
  type StreamOptions,
  type StreamHandle,
} from '@/services/stream-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseStreamStartOptions extends StreamOptions {
  provider: string
  messages: ChatMessage[]
  /** Called per chunk as it arrives. Content is also accumulated in state. */
  onChunk?: (chunk: string) => void
  /** Called when the stream ends successfully with the full accumulated string. */
  onDone?: (fullContent: string) => void
  /** Called when the stream errors or is aborted with an error. */
  onError?: (error: string) => void
}

export interface UseStreamReturn {
  /** Accumulated content from the current or last stream. */
  content: string
  /** True while a stream is active. */
  isStreaming: boolean
  /** Error message from the last failed stream. Null on success. */
  error: string | null
  /**
   * Start a new stream. Returns immediately; stream runs asynchronously.
   * Calling start() while isStreaming is true will abort the current stream
   * first before starting a new one.
   */
  start: (options: UseStreamStartOptions) => Promise<void>
  /** Abort the in-flight stream. Sets isStreaming to false. */
  abort: () => void
  /** Clear content and error state. No-op if a stream is in flight. */
  reset: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStream(): UseStreamReturn {
  const [content, setContent] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Hold a reference to the current stream handle so abort() can reach it
  const handleRef = useRef<StreamHandle | null>(null)
  // Accumulate content outside of state to avoid stale closure issues
  const accumulatorRef = useRef<string>('')

  const abort = useCallback(() => {
    if (handleRef.current) {
      handleRef.current.abort('user-aborted')
      handleRef.current = null
    }
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    if (isStreaming) return
    accumulatorRef.current = ''
    setContent('')
    setError(null)
  }, [isStreaming])

  const start = useCallback(
    async (options: UseStreamStartOptions) => {
      const {
        provider,
        messages,
        model,
        temperature,
        maxTokens,
        onChunk,
        onDone,
        onError,
      } = options

      // Abort any existing stream before starting a new one
      if (handleRef.current) {
        handleRef.current.abort('superseded')
        handleRef.current = null
      }

      // Reset accumulator for this stream
      accumulatorRef.current = ''
      setContent('')
      setError(null)
      setIsStreaming(true)

      const streamOptions: StreamOptions = { model, temperature, maxTokens }

      try {
        const handle = await streamChat(
          provider,
          messages,
          streamOptions,
          (event) => {
            switch (event.type) {
              case 'chunk': {
                accumulatorRef.current += event.content
                setContent(accumulatorRef.current)
                onChunk?.(event.content)
                break
              }
              case 'done': {
                setIsStreaming(false)
                handleRef.current = null
                onDone?.(accumulatorRef.current)
                break
              }
              case 'error': {
                setIsStreaming(false)
                setError(event.error)
                handleRef.current = null
                onError?.(event.error)
                break
              }
              case 'aborted': {
                setIsStreaming(false)
                handleRef.current = null
                // Treat user aborts as non-error state (content stays)
                break
              }
            }
          },
        )
        handleRef.current = handle
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to start stream'
        setIsStreaming(false)
        setError(msg)
        handleRef.current = null
        onError?.(msg)
      }
    },
    [],
  )

  return { content, isStreaming, error, start, abort, reset }
}
