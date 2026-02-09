import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockStreamChatMessage = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/lib/api-key-service', () => ({
  getUserProviderConfigs: (userId: string) => mockGetUserProviderConfigs(userId),
  getUserApiKey: (userId: string, provider: string) =>
    mockGetUserApiKey(userId, provider),
}))

vi.mock('@/services/api-service', () => ({
  streamChatMessage: (
    provider: string,
    messages: unknown[],
    onChunk: (chunk: string) => void,
    options: Record<string, unknown>
  ) => mockStreamChatMessage(provider, messages, onChunk, options),
}))

import { POST } from '@/app/api/llm/stream/route'

const makeRequest = (body: string) =>
  new NextRequest('http://localhost/api/llm/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('/api/llm/stream route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        provider: 'openai',
        settings: {
          models: ['gpt-4'],
          rateLimits: { requests: 60, window: 60000 },
        },
      },
    ])
    mockGetUserApiKey.mockResolvedValue('sk-test-12345678901234567890')
    mockStreamChatMessage.mockImplementation(async (_provider, _messages, onChunk) => {
      onChunk('hello')
    })
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(
      makeRequest(JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }))
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns INVALID_JSON for malformed request bodies', async () => {
    const response = await POST(makeRequest('{not-json'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Request body must be valid JSON',
      code: 'INVALID_JSON',
    })
  })

  it('returns validation error when provider/messages are missing', async () => {
    const response = await POST(makeRequest(JSON.stringify({ provider: 'openai' })))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider and messages are required',
      code: 'VALIDATION_ERROR',
    })
  })

  it('returns unsupported provider error', async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ provider: 'unknown', messages: [{ role: 'user', content: 'hi' }] }))
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Provider 'unknown' not supported",
      code: 'PROVIDER_UNSUPPORTED',
    })
  })

  it('returns provider not configured when config or key is missing', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([])

    const response = await POST(
      makeRequest(JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }))
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider openai is not configured',
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })

  it('returns key format error for invalid provider key', async () => {
    mockGetUserApiKey.mockResolvedValue('bad-key')

    const response = await POST(
      makeRequest(JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }))
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid API key format for the selected provider',
      code: 'PROVIDER_KEY_FORMAT_INVALID',
    })
  })

  it('applies scoped rate limiting per user/provider', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-rate-limit' } })
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        provider: 'openrouter',
        settings: {
          models: ['openrouter/auto'],
          rateLimits: { requests: 1, window: 60000 },
        },
      },
    ])
    mockGetUserApiKey.mockResolvedValue('sk-or-v1-12345678901234567890')

    const first = await POST(
      makeRequest(JSON.stringify({ provider: 'openrouter', messages: [{ role: 'user', content: 'first' }] }))
    )
    expect(first.status).toBe(200)

    const second = await POST(
      makeRequest(JSON.stringify({ provider: 'openrouter', messages: [{ role: 'user', content: 'second' }] }))
    )

    expect(second.status).toBe(429)
    await expect(second.json()).resolves.toEqual({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
    })
  })

  it('includes coded error events in NDJSON stream when provider streaming fails', async () => {
    mockStreamChatMessage.mockRejectedValue(new Error('HTTP 429: Too many requests'))

    const response = await POST(
      makeRequest(JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hello' }] }))
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson')

    const body = await response.text()
    expect(body).toContain('"type":"error"')
    expect(body).toContain('"code":"RATE_LIMITED"')
  })
})
