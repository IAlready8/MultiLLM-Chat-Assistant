import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserApiKey = vi.fn()
const mockTestProviderKey = vi.fn()
const mockValidateApiKeyFormat = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/api-key-service', () => ({
  getUserApiKey: (userId: string, provider: string) =>
    mockGetUserApiKey(userId, provider),
}))

vi.mock('@/lib/provider-key-test', () => ({
  testProviderKey: (provider: string, apiKey: string) =>
    mockTestProviderKey(provider, apiKey),
  validateApiKeyFormat: (provider: string, apiKey: string) =>
    mockValidateApiKeyFormat(provider, apiKey),
}))

import { POST } from '@/app/api/test-api-key/route'

const makeRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/test-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/test-api-key route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
    })
    mockValidateApiKeyFormat.mockReturnValue(null)
  })

  it('forwards auth response when strict auth blocks request', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(makeRequest({ provider: 'openai', apiKey: 'sk-test' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when provider is missing', async () => {
    const response = await POST(makeRequest({ apiKey: 'sk-test' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      message: 'Provider is required.',
    })
  })

  it('tests saved key when testSaved=true', async () => {
    mockGetUserApiKey.mockResolvedValue('sk-test-1234567890')
    mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })

    const response = await POST(
      makeRequest({ provider: 'openai', testSaved: true })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: true,
      reason: 'ok',
    })
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith()
    expect(mockGetUserApiKey).toHaveBeenCalledWith('user-1', 'openai')
  })

  it('returns invalid when no saved key exists', async () => {
    mockGetUserApiKey.mockResolvedValue(null)

    const response = await POST(
      makeRequest({ provider: 'openai', testSaved: true })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'invalid',
    })
  })

  it('returns 500 when saved key lookup throws', async () => {
    mockGetUserApiKey.mockRejectedValue(new Error('db down'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(
      makeRequest({ provider: 'openai', testSaved: true })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'unreachable',
      message: 'Failed to test API key.',
    })

    consoleSpy.mockRestore()
  })

  it('returns format error for invalid provided keys', async () => {
    mockValidateApiKeyFormat.mockReturnValue('OpenAI API key should start with "sk-"')

    const response = await POST(
      makeRequest({ provider: 'openai', apiKey: 'bad-key' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'format',
    })
    expect(mockTestProviderKey).not.toHaveBeenCalled()
  })

  it('maps provider statuses to health states with latency', async () => {
    mockTestProviderKey.mockResolvedValue({ ok: false, status: 429 })

    const response = await POST(
      makeRequest({ provider: 'openai', apiKey: 'sk-test-1234567890' })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('rate_limited')
    expect(typeof body.latencyMs).toBe('number')
  })

  it('verifies both approved models using the provided DeepSeek key', async () => {
    mockTestProviderKey.mockResolvedValue(
      new Response(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
        }),
        { status: 200 },
      ),
    )

    const response = await POST(
      makeRequest({
        provider: 'deepseek',
        apiKey: 'deepseek-test-key-12345',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: true,
      reason: 'ok',
      message: 'API key verified successfully.',
    })
    expect(mockTestProviderKey).toHaveBeenCalledWith(
      'deepseek',
      'deepseek-test-key-12345',
    )
  })

  it('fails the DeepSeek Settings probe when an approved model disappears', async () => {
    mockTestProviderKey.mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [] }), {
        status: 200,
      }),
    )

    const response = await POST(
      makeRequest({
        provider: 'deepseek',
        apiKey: 'deepseek-test-key-12345',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'provider_error',
      message: 'The approved DeepSeek models are not currently available.',
    })
  })

  it('requires a DeepSeek API key before probing the provider', async () => {
    const response = await POST(makeRequest({ provider: 'deepseek' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      valid: false,
      message: 'API key is required.',
    })
    expect(mockTestProviderKey).not.toHaveBeenCalled()
  })

  it('returns unreachable when provider request throws', async () => {
    mockTestProviderKey.mockRejectedValue(new Error('network down'))

    const response = await POST(
      makeRequest({ provider: 'openai', apiKey: 'sk-test-1234567890' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      reason: 'unreachable',
    })
  })
})
