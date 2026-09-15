import { iterNdjson } from './ndjson'

export type StreamEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'aborted' }

export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface StreamOptions { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal }
export interface StreamHandle { abort: (reason?: unknown) => void }

export class StreamResponseError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message)
    this.name = 'StreamResponseError'
  }
}

export async function readChatStream(response: Response, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new StreamResponseError(typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`, response.status, body?.code)
  }
  if (!response.body) throw new StreamResponseError('No response body', 502, 'EMPTY_RESPONSE_BODY')
  let content = ''
  for await (const value of iterNdjson(response.body, signal)) {
    if (!value || typeof value !== 'object') throw new StreamResponseError('Invalid stream event', 502, 'STREAM_MALFORMED')
    const event = value as Record<string, unknown>
    if (event.type === 'chunk' && typeof event.content === 'string') {
      content += event.content
      if (content.length > 1_048_576) throw new StreamResponseError('Response exceeded the size limit', 502, 'STREAM_TOO_LARGE')
      onChunk(event.content)
    } else if (event.type === 'done') {
      if (!content.trim()) throw new StreamResponseError('Provider returned an empty response', 502, 'PROVIDER_EMPTY_RESPONSE')
      return content
    } else if (event.type === 'error') {
      throw new StreamResponseError(typeof event.error === 'string' ? event.error : 'Stream error', 502, typeof event.code === 'string' ? event.code : undefined)
    } else if (event.type === 'aborted') {
      throw new DOMException('Generation stopped', 'AbortError')
    } else {
      throw new StreamResponseError('Invalid stream event', 502, 'STREAM_MALFORMED')
    }
  }
  throw new StreamResponseError('Connection ended before the response completed. Retry this model.', 502, 'STREAM_INTERRUPTED')
}

export async function streamChat(provider: string, messages: ChatMessage[], options: StreamOptions = {}, onEvent: (event: StreamEvent) => void): Promise<StreamHandle> {
  const controller = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
  const handle = { abort: (reason?: unknown) => controller.abort(reason) }
  const fail = (error: unknown) => {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) onEvent({ type: 'aborted' })
    else onEvent({ type: 'error', error: error instanceof Error ? error.message : 'Stream error' })
  }
  try {
    const response = await fetch('/api/llm/stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ provider, messages, model: options.model, temperature: options.temperature, max_tokens: options.maxTokens }),
    })
    if (!response.ok || !response.body) {
      await readChatStream(response, () => {}, signal)
    } else {
      void readChatStream(response, chunk => onEvent({ type: 'chunk', content: chunk }), signal).then(() => onEvent({ type: 'done' })).catch(fail)
    }
  } catch (error) { fail(error) }
  return handle
}
