import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()
const mockLogError = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
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
