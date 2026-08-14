import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()
const mockLogError = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/api-key-service', () => ({
  getUserProviderConfigs: (userId: string) => mockGetUserProviderConfigs(userId),
  getUserApiKey: (userId: string, provider: string) =>
    mockGetUserApiKey(userId, provider),
}))

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: (event: unknown) => mockRecordAnalyticsEvent(event),
}))

vi.mock('@/lib/error-system', () => {
  class MockLLMProviderError extends Error {
    constructor(provider: string, message: string) {
      super(message)
      this.name = `LLMProviderError:${provider}`
    }
  }

  class MockNotImplementedError extends Error {
    constructor(featureName: string) {
      super(`Feature '${featureName}' is not implemented`)
      this.name = 'NotImplementedError'
    }
  }

  return {
    errorManager: {
      logError: (...args: unknown[]) => mockLogError(...args),
    },
    createErrorContext: (
      endpoint: string,
      userId?: string,
      metadata: Record<string, unknown> = {}
    ) => ({ endpoint, userId, timestamp: new Date(), metadata }),
    LLMProviderError: MockLLMProviderError,
    NotImplementedError: MockNotImplementedError,
  }
})

import { POST } from '@/app/api/llm/chat/route'

describe('/api/llm/chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())

    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        provider: 'openai',
        settings: {},
      },
    ])
    mockGetUserApiKey.mockResolvedValue('sk-test-12345678901234567890')
    mockRecordAnalyticsEvent.mockResolvedValue(undefined)
    mockLogError.mockResolvedValue(undefined)
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }),
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('allows guest-mode authenticated user flow', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'guest-user-1', isGuest: true },
    })

    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'guest response' }, finish_reason: 'stop' }],
        usage: { total_tokens: 12 },
      }),
    } as Response)

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hello from guest' }],
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mockGetUserProviderConfigs).toHaveBeenCalledWith('guest-user-1')
  })

  it('returns validation error when messages are missing', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai' }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Messages are required',
      code: 'VALIDATION_ERROR',
    })
  })

  it('rejects unsupported reasoning effort values before provider lookup', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'deepseek',
          reasoning_effort: 'extreme',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'reasoning_effort must be one of: off, low, high, max',
      code: 'VALIDATION_ERROR',
    })
    expect(mockGetUserProviderConfigs).not.toHaveBeenCalled()
  })

  it('returns unsupported provider error', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'unknown', messages: [{ role: 'user', content: 'hi' }] }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Provider 'unknown' not supported",
      code: 'PROVIDER_UNSUPPORTED',
    })
  })

  it('returns provider not configured when config is absent', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([])

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider openai not configured',
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })

  it('returns provider not configured when key retrieval fails', async () => {
    mockGetUserApiKey.mockResolvedValue(null)

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider openai not configured',
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })

  it('rejects a legacy stored provider endpoint before making an upstream request', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        provider: 'openai',
        settings: { baseUrl: 'http://169.254.169.254/latest/meta-data' },
      },
    ])

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Configured provider endpoint is not allowed',
      code: 'PROVIDER_ENDPOINT_BLOCKED',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['private endpoint', 'http://169.254.169.254:11434'],
    ['public custom endpoint', 'https://ollama.example.com'],
    ['wrong-port localhost', 'http://localhost:8080'],
  ])('rejects a legacy Ollama %s before making an upstream request', async (_label, baseUrl) => {
    mockGetUserProviderConfigs.mockResolvedValue([
      { provider: 'ollama', settings: { baseUrl } },
    ])

    for (const stream of [false, true]) {
      const response = await POST(
        new NextRequest('http://localhost/api/llm/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'ollama',
            stream,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        }),
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: 'Configured provider endpoint is not allowed',
        code: 'PROVIDER_ENDPOINT_BLOCKED',
      })
    }

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns INTERNAL_ERROR when provider config lookup throws', async () => {
    mockGetUserProviderConfigs.mockRejectedValue(
      new Error('database unavailable during provider lookup')
    )

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'database unavailable during provider lookup',
      code: 'INTERNAL_ERROR',
    })
  })

  it('returns key format error for invalid provider key', async () => {
    mockGetUserApiKey.mockResolvedValue('bad-key')

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid API key format for the selected provider',
      code: 'PROVIDER_KEY_FORMAT_INVALID',
    })
  })

  it('applies scoped rate limiting per user/provider', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'chat-rate-limit-user' } })
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        provider: 'openai',
        settings: {
          models: ['gpt-4'],
          rateLimits: { requests: 1, window: 60000 },
        },
      },
    ])
    mockGetUserApiKey.mockResolvedValue('sk-test-12345678901234567890')

    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'first' }, finish_reason: 'stop' }],
        usage: { total_tokens: 10 },
      }),
    } as Response)

    const first = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'first' }],
        }),
      }),
    )
    expect(first.status).toBe(200)

    const second = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'second' }],
        }),
      }),
    )
    expect(second.status).toBe(429)
    const retryAfter = Number(second.headers.get('Retry-After'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
    await expect(second.json()).resolves.toEqual({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
    })
  })

  it('returns provider response for non-stream success', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello from provider' }, finish_reason: 'stop' }],
        usage: { total_tokens: 42 },
      }),
    } as Response)

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Say hello' }],
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      content: 'Hello from provider',
      finish_reason: 'stop',
    })
  })

  it('maps provider 429 errors to RATE_LIMITED', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Too many requests' } }),
    } as Response)

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    )

    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider rate limit reached, please retry shortly',
      code: 'RATE_LIMITED',
    })
  })

  it('maps provider auth failures to PROVIDER_AUTH_ERROR', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    } as Response)

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider rejected the configured API key',
      code: 'PROVIDER_AUTH_ERROR',
    })
  })

  it('maps provider timeout failures to PROVIDER_TIMEOUT', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockRejectedValue(new Error('request timed out while contacting provider'))

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    )

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider request timed out',
      code: 'PROVIDER_TIMEOUT',
    })
  })

  it('maps malformed provider payloads to PROVIDER_MALFORMED_RESPONSE', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      },
    } as unknown as Response)

    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          stream: false,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      })
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider returned malformed response',
      code: 'PROVIDER_MALFORMED_RESPONSE',
    })
  })

  it('maps invalid JSON body to INVALID_JSON', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-valid-json',
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Request body must be valid JSON',
      code: 'INVALID_JSON',
    })
  })
})
