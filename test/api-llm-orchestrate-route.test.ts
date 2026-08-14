import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
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
  },
  headers: HeadersInit = {
    'Content-Type': 'application/json',
    cookie: 'next-auth.session-token=test-token',
  },
) =>
  new NextRequest('http://localhost:3000/api/llm/orchestrate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

describe('/api/llm/orchestrate route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.unstubAllEnvs()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
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

  it('rejects disabled DeepSeek before sidecar or fallback network access', async () => {
    const response = await POST(
      buildRequest({
        prompt: 'compare answers',
        requests: [
          {
            provider: 'deepseek',
            model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
            prompt: 'Summarize this.',
          },
        ],
      })
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'DeepSeek is currently unavailable.',
      code: 'PROVIDER_DISABLED',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('proxies successful response from Python sidecar', async () => {
    const pythonPayload = [{ provider: 'openai', model: 'gpt-4', content: 'Hello' }]
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(pythonPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const response = await POST(buildRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(pythonPayload)
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
    const body = (await response.json()) as Array<{ content: string }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local')
    expect(body[0]?.content).toBe('fallback answer')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/llm/chat')
  })

  it('uses the trusted server origin instead of hostile request forwarding headers', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://trusted.example.test/app')
    const fetchMock = vi.mocked(global.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'python unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'trusted fallback' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    const response = await POST(
      buildRequest(undefined, {
        'Content-Type': 'application/json',
        cookie: 'next-auth.session-token=test-token',
        host: 'attacker.example.test',
        'x-forwarded-proto': 'http',
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://trusted.example.test/api/llm/chat',
    )
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain('attacker.example.test')
    const fallbackInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(fallbackInit.redirect).toBe('error')
    expect(new Headers(fallbackInit.headers).get('cookie')).toBe(
      'next-auth.session-token=test-token',
    )
  })

  it.each([
    ['missing trusted origin', undefined],
    ['unsupported protocol', 'ftp://trusted.example.test'],
    ['credentials', 'https://user:pass@trusted.example.test'],
    ['query', 'https://trusted.example.test/?target=attacker'],
    ['fragment', 'https://trusted.example.test/#target=attacker'],
  ])('fails closed in production for %s', async (_label, trustedOrigin) => {
    vi.stubEnv('NODE_ENV', 'production')
    if (trustedOrigin === undefined) {
      delete process.env.NEXTAUTH_URL
    } else {
      vi.stubEnv('NEXTAUTH_URL', trustedOrigin)
    }

    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    const response = await POST(buildRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Local orchestration fallback unavailable',
      code: 'ORCHESTRATION_FALLBACK_UNAVAILABLE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('disables fallback in preview deployments rather than forwarding cookies to an ambiguous origin', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NEXTAUTH_URL', 'https://production.example.test')
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    const response = await POST(buildRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'ORCHESTRATION_FALLBACK_UNAVAILABLE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('turns a fallback redirect into a deterministic 5xx without following it', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://trusted.example.test')
    const fetchMock = vi.mocked(global.fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'python unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://attacker.example.test/steal' },
        }),
      )

    const response = await POST(buildRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Local orchestration fallback unavailable',
      code: 'ORCHESTRATION_FALLBACK_UNAVAILABLE',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).redirect).toBe('error')
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
    const body = (await response.json()) as Array<{ content: string }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local-network')
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
    const body = (await response.json()) as Array<{ content: string }>

    expect(response.status).toBe(200)
    expect(response.headers.get('x-orchestration-fallback')).toBe('local-timeout')
    expect(body[0]?.content).toBe('fallback from timeout path')
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

  it('requires an authenticated user', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await POST(buildRequest())
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith()
  })
})
