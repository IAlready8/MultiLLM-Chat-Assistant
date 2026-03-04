import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamChat, type StreamEvent } from '@/services/stream-client'

const makeNdjsonStream = (lines: string[]) => {
  const encoder = new TextEncoder()
  const payload = lines.join('\n') + '\n'
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

const flushAsync = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('stream-client NDJSON protocol', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls /api/llm/stream and emits chunk + done events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeNdjsonStream([
        JSON.stringify({ type: 'chunk', content: 'Hello' }),
        JSON.stringify({ type: 'chunk', content: ' world' }),
        JSON.stringify({ type: 'done' }),
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const events: StreamEvent[] = []
    await streamChat(
      'openai',
      [{ role: 'user', content: 'hi' }],
      { model: 'gpt-4o-mini' },
      (event) => events.push(event)
    )

    await flushAsync()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/llm/stream',
      expect.objectContaining({
        method: 'POST',
      })
    )

    const call = fetchMock.mock.calls[0]
    const body = JSON.parse(call[1].body as string)
    expect(body).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
    expect(events).toEqual([
      { type: 'chunk', content: 'Hello' },
      { type: 'chunk', content: ' world' },
      { type: 'done' },
    ])
  })

  it('emits error event when NDJSON contains type=error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: makeNdjsonStream([
          JSON.stringify({ type: 'error', error: 'Provider timed out' }),
        ]),
      })
    )

    const events: StreamEvent[] = []
    await streamChat(
      'openai',
      [{ role: 'user', content: 'hi' }],
      {},
      (event) => events.push(event)
    )

    await flushAsync()

    expect(events).toEqual([{ type: 'error', error: 'Provider timed out' }])
  })

  it('emits immediate error event for non-ok HTTP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit exceeded' }),
      })
    )

    const events: StreamEvent[] = []
    await streamChat(
      'openai',
      [{ role: 'user', content: 'hi' }],
      {},
      (event) => events.push(event)
    )

    expect(events).toEqual([{ type: 'error', error: 'Rate limit exceeded' }])
  })
})
