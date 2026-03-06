import { iterNdjson } from './ndjson'

export type StreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'aborted' }

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface StreamHandle {
  abort: (reason?: any) => void
}

// Client helper to consume the NDJSON streaming API.
// Calls onEvent for each event and returns a handle to abort.
export async function streamChat(
  provider: string,
  messages: ChatMessage[],
  options: StreamOptions = {},
  onEvent: (e: StreamEvent) => void
): Promise<StreamHandle> {
  const controller = new AbortController()
  const res = await fetch('/api/llm/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      messages,
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
    signal: controller.signal,
  })

  if (!res.ok) {
    let err = `HTTP ${res.status}`
    try { const j = await res.json(); err = j?.error || err } catch {}
    onEvent({ type: 'error', error: err })
    return { abort: (r?: any) => controller.abort(r) }
  }

  const body = res.body
  if (!body) {
    onEvent({ type: 'error', error: 'No response body' })
    return { abort: (r?: any) => controller.abort(r) }
  }

  ;(async () => {
    try {
      for await (const obj of iterNdjson(body)) {
        // Normalize server events to StreamEvent union
        if (obj?.type === 'chunk' && typeof obj?.content === 'string') {
          onEvent({ type: 'chunk', content: obj.content })
        } else if (obj?.type === 'done') {
          onEvent({ type: 'done' })
        } else if (obj?.type === 'error') {
          onEvent({ type: 'error', error: String(obj?.error ?? 'Unknown error') })
        } else if (obj?.type === 'aborted') {
          onEvent({ type: 'aborted' })
        }
      }
    } catch (e: any) {
      if (controller.signal.aborted) {
        onEvent({ type: 'aborted' })
      } else {
        onEvent({ type: 'error', error: e?.message || 'Stream error' })
      }
    }
  })()

  return { abort: (reason?: any) => controller.abort(reason) }
}
