import { afterEach, describe, expect, it, vi } from 'vitest'

import { kimiAdapter } from '@/lib/providers/kimi'
import type { ProviderRequest } from '@/lib/providers/types'
import { testProviderKey } from '@/lib/provider-key-test'

const config = { apiKey: 'test-only-kimi-key' }
const request: ProviderRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'kimi-k3',
  temperature: 0.2,
  max_tokens: 2048,
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('kimiAdapter', () => {
  it('verifies keys with the authenticated models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [] }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await kimiAdapter.testConnection?.(config)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.ai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-only-kimi-key',
        }),
      }),
    )
  })

  it('uses the same models probe in the Settings key verifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(testProviderKey('kimi', config.apiKey)).resolves.toMatchObject({
      ok: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.ai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer test-only-kimi-key' },
      }),
    )
  })

  it('sends a compatible chat payload without fixed sampling parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'Hi from Kimi' }, finish_reason: 'stop' },
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 4,
            total_tokens: 7,
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(kimiAdapter.chat(request, config)).resolves.toEqual({
      content: 'Hi from Kimi',
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
      },
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const payload = JSON.parse(init.body as string)
    expect(payload).toEqual({
      model: 'kimi-k3',
      messages: request.messages,
      stream: false,
      max_completion_tokens: 2048,
    })
    expect(payload).not.toHaveProperty('temperature')
    expect(payload).not.toHaveProperty('top_p')
  })

  it('streams final content across chunk boundaries and omits reasoning text', async () => {
    const body = streamFromChunks([
      'data: {"choices":[{"delta":{"reasoning_content":"private"}}]}\r\n',
      'data: {"choices":[{"del',
      'ta":{"content":"Hel"}}]}\r\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\r\n',
      'data: [DONE]\r\n',
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    )

    const chunks: string[] = []
    for await (const chunk of kimiAdapter.stream(request, config)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hel', 'lo'])
  })
})
