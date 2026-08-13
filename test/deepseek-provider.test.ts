import { afterEach, describe, expect, it, vi } from 'vitest'

import { deepseekAdapter } from '@/lib/providers/deepseek'
import { classifyProviderError } from '@/lib/providers/errors'
import type { ProviderRequest } from '@/lib/providers/types'
import { testProviderKey } from '@/lib/provider-key-test'

const config = { apiKey: '' }
const request: ProviderRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('deepseekAdapter', () => {
  it('checks the public community models endpoint without authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'deepseek-ai/DeepSeek-V4-Flash-0731' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await deepseekAdapter.testConnection?.(config)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
  })

  it('never forwards credentials or caller-supplied headers to the public endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'deepseek-ai/DeepSeek-V4-Flash-0731' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await deepseekAdapter.testConnection?.({
      apiKey: 'must-not-be-sent',
      baseUrl:
        'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1',
      extraHeaders: {
        Authorization: 'Bearer must-not-be-sent',
        'X-Private-Token': 'must-not-be-sent',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1/models',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('rejects a models probe when the approved model is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ object: 'list', data: [] }), {
          status: 200,
        }),
      ),
    )

    await expect(
      deepseekAdapter.testConnection?.(config),
    ).rejects.toThrow(
      'DeepSeek community endpoint does not advertise deepseek-ai/DeepSeek-V4-Flash-0731',
    )
  })

  it('uses the same credentialless models probe in Settings', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(testProviderKey('deepseek', '')).resolves.toMatchObject({
      ok: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1/models',
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined()
  })

  it('sends the community endpoint reasoning and sampling payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'Hi from DeepSeek' }, finish_reason: 'stop' },
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

    await expect(deepseekAdapter.chat(request, config)).resolves.toEqual({
      content: 'Hi from DeepSeek',
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
      model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
      messages: request.messages,
      stream: false,
      max_tokens: 2048,
      reasoning_effort: 'high',
      temperature: 0.2,
      top_p: 0.95,
    })
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
    for await (const chunk of deepseekAdapter.stream(request, config)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hel', 'lo'])
  })

  it.each([
    ['off', undefined],
    ['low', 'low'],
    ['high', 'high'],
    ['max', 'max'],
  ] as const)('maps reasoning effort %s to the upstream payload', async (effort, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await deepseekAdapter.chat({ ...request, reasoning_effort: effort }, config)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const payload = JSON.parse(init.body as string)
    if (expected === undefined) {
      expect(payload).not.toHaveProperty('reasoning_effort')
    } else {
      expect(payload.reasoning_effort).toBe(expected)
    }
  })

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      ),
    )

    await expect(deepseekAdapter.chat(request, config)).rejects.toBeInstanceOf(
      SyntaxError,
    )
  })

  it('preserves Retry-After when the shared endpoint returns 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Slow down' }), {
          status: 429,
          headers: { 'Retry-After': '17' },
        }),
      ),
    )

    let error: unknown
    try {
      await deepseekAdapter.chat(request, config)
    } catch (caught) {
      error = caught
    }

    expect(classifyProviderError(error)).toEqual({
      status: 429,
      code: 'RATE_LIMITED',
      error: 'Rate limit exceeded. Please wait 17 seconds before trying again.',
      retryAfterSeconds: 17,
    })
  })


  it('converts an HTTP-date Retry-After value to seconds', async () => {
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Slow down' }), {
          status: 429,
          headers: { 'Retry-After': 'Sun, 02 Aug 2026 12:00:19 GMT' },
        }),
      ),
    )

    let error: unknown
    try {
      await deepseekAdapter.chat(request, config)
    } catch (caught) {
      error = caught
    }

    expect(classifyProviderError(error).retryAfterSeconds).toBe(19)
  })

  it('uses a bounded fallback for malformed Retry-After values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Slow down' }), {
          status: 429,
          headers: { 'Retry-After': '17 seconds' },
        }),
      ),
    )

    let error: unknown
    try {
      await deepseekAdapter.chat(request, config)
    } catch (caught) {
      error = caught
    }

    expect(classifyProviderError(error).retryAfterSeconds).toBe(5)
  })

  it('uses the fallback for an unsafe numeric Retry-After value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Slow down' }), {
          status: 429,
          headers: { 'Retry-After': '999999999999999999999999999999' },
        }),
      ),
    )

    let error: unknown
    try {
      await deepseekAdapter.chat(request, config)
    } catch (caught) {
      error = caught
    }

    expect(classifyProviderError(error).retryAfterSeconds).toBe(5)
  })
})
