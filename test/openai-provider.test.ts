import { afterEach, describe, expect, it, vi } from 'vitest'

import { openaiAdapter } from '@/lib/providers/openai'
import type { ProviderRequest } from '@/lib/providers/types'

const config = { apiKey: 'test-only-openai-key' }
const request: ProviderRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'gpt-5.6-sol',
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

describe('openaiAdapter GPT-5.6 compatibility', () => {
  it('uses the Chat Completions token and reasoning fields for GPT-5.6', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(openaiAdapter.chat(request, config)).resolves.toEqual({
      content: 'Hello',
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 2,
        completion_tokens: 1,
        total_tokens: 3,
      },
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const payload = JSON.parse(init.body as string)
    expect(payload).toEqual({
      model: 'gpt-5.6-sol',
      messages: request.messages,
      temperature: 0.2,
      max_completion_tokens: 2048,
      reasoning_effort: 'none',
      stream: false,
    })
    expect(payload).not.toHaveProperty('max_tokens')
  })

  it('uses the same GPT-5.6 contract for streaming', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          streamFromChunks([
            'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
            'data: [DONE]\n\n',
          ]),
          { status: 200 },
        ),
      ),
    )

    const chunks: string[] = []
    for await (const chunk of openaiAdapter.stream(request, config)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hel', 'lo'])
    const fetchMock = vi.mocked(fetch)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      model: 'gpt-5.6-sol',
      max_completion_tokens: 2048,
      reasoning_effort: 'none',
      stream: true,
    })
    expect(payload).not.toHaveProperty('max_tokens')
  })

  it('preserves the legacy payload for earlier OpenAI models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await openaiAdapter.chat({ ...request, model: 'gpt-4o' }, config)

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      model: 'gpt-4o',
      max_tokens: 2048,
      stream: false,
    })
    expect(payload).not.toHaveProperty('max_completion_tokens')
    expect(payload).not.toHaveProperty('reasoning_effort')
  })
})
