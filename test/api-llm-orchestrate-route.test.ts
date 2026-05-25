import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

import { POST } from '@/app/api/llm/orchestrate/route'

const buildRequest = (
  body: Record<string, unknown> = {
    prompt: 'compare answers',
    requests: [
      {
        provider: 'openai',
        model: 'gpt-4',
        prompt: 'Summarize this.',
      },
    ],
  }
) =>
  new NextRequest('http://localhost:3000/api/llm/orchestrate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: 'next-auth.session-token=test-token',
    },
    body: JSON.stringify(body),
  })

describe('/api/llm/orchestrate route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(buildRequest())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 for invalid JSON body', async () => {
    const request = new NextRequest('http://localhost:3000/api/llm/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"bad-json"',
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON body' })
  })

  it('returns 400 for invalid request payload', async () => {
    const response = await POST(
      buildRequest({
        prompt: 123,
        requests: [{ provider: 'openai' }],
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid input',
    })
  })

  it('proxies successful response from Python sidecar', async () => {
    const pythonPayload = [
      {
        provider: 'openai',
        model: 'gpt-4',
        content: 'Hello',
        prompt_tokens: 2,
        completion_tokens: 2,
        cost_usd: 0.001,
        latency_ms: 100,
      },
    ]
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(pythonPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const response = await POST(buildRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4',
        success: true,
        content: 'Hello',
        prompt_tokens: 2,
        completion_tokens: 2,
        cost_usd: 0.001,
        latency_ms: 100,
        usage: {
          inputTokens: 2,
          outputTokens: 2,
          totalTokens: 4,
        },
        latencyMs: 100,
      }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/llm/orchestrate')
  })

  it('falls back locally when Python service returns 5xx', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'python unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: 'fallback answer',
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

    const response = await POST(buildRequest())
    const body = (await response.json()) as Array<{ content: string; success: boolean }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local')
    expect(body[0]?.success).toBe(true)
    expect(body[0]?.content).toBe('fallback answer')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/llm/chat')
  })

  it('falls back locally on network errors reaching Python service', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: 'fallback from network path',
            usage: { prompt_tokens: 4, completion_tokens: 4, total_tokens: 8 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

    const response = await POST(buildRequest())
    const body = (await response.json()) as Array<{ content: string; success: boolean }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local-network')
    expect(body[0]?.success).toBe(true)
    expect(body[0]?.content).toBe('fallback from network path')
  })

  it('falls back locally on timeout aborts reaching Python service', async () => {
    const fetchMock = vi.mocked(global.fetch)
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' })

    fetchMock
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: 'fallback from timeout path',
            usage: { prompt_tokens: 6, completion_tokens: 2, total_tokens: 8 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

    const response = await POST(buildRequest())
    const body = (await response.json()) as Array<{ content: string; success: boolean }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local-timeout')
    expect(body[0]?.success).toBe(true)
    expect(body[0]?.content).toBe('fallback from timeout path')
  })

  it('returns structured item-level errors for local fallback provider failures', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'python unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'Provider rejected the configured API key',
            code: 'PROVIDER_AUTH_ERROR',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )

    const response = await POST(buildRequest())
    const body = (await response.json()) as Array<{
      content?: string
      success: boolean
      error: { code: string; message: string; retryable: boolean }
    }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local')
    expect(body[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4',
      success: false,
      error: {
        code: 'PROVIDER_AUTH_ERROR',
        message: 'Provider rejected the configured API key',
        retryable: false,
      },
      completion_tokens: 0,
      cost_usd: 0,
    })
    expect(body[0]?.content).toBeUndefined()
  })

  it('falls back locally for sidecar validation errors from provider ID mismatch', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ detail: 'Invalid request parameters', error: 'validation_error' }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'google fallback response' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    const response = await POST(
      buildRequest({
        prompt: 'compare answers',
        requests: [
          {
            provider: 'googleai',
            model: 'gemini-1.5-flash',
            prompt: 'Summarize this.',
          },
        ],
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local-validation')
    expect(body[0]).toMatchObject({
      provider: 'googleai',
      success: true,
      content: 'google fallback response',
    })
  })

  it('rejects cohere because it is not in the canonical TypeScript provider registry', async () => {
    const response = await POST(
      buildRequest({
        prompt: 'compare answers',
        requests: [
          {
            provider: 'cohere',
            model: 'command-r',
            prompt: 'Summarize this.',
          },
        ],
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid input',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('normalizes structured provider errors from Python sidecar results', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            provider: 'openai',
            model: 'gpt-4',
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Provider rate limit reached, please retry shortly',
              retryable: true,
            },
            prompt_tokens: 0,
            completion_tokens: 0,
            cost_usd: 0,
            latency_ms: 12,
          },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    )

    const response = await POST(buildRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4',
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Provider rate limit reached, please retry shortly',
        retryable: true,
      },
      latencyMs: 12,
    })
    expect(body[0].content).toBeUndefined()
  })

  it('does not fallback for 429 provider-side errors', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const response = await POST(buildRequest())
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      error: 'Python service error',
      details: 'Too many requests',
      status: 429,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes allowGuest=true to authenticated-user lookup', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await POST(buildRequest())
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith({ allowGuest: true })
  })
})
