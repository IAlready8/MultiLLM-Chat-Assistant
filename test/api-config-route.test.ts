import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockStoreUserApiKey = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockDeleteUserProviderConfig = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/lib/api-key-service', () => ({
  storeUserApiKey: (
    userId: string,
    provider: string,
    apiKey: string,
    settings: Record<string, unknown>
  ) => mockStoreUserApiKey(userId, provider, apiKey, settings),
  getUserProviderConfigs: (userId: string) => mockGetUserProviderConfigs(userId),
  deleteUserProviderConfig: (userId: string, provider: string) =>
    mockDeleteUserProviderConfig(userId, provider),
}))

import { GET, POST } from '@/app/api/config/route'

const makePostRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/config route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('GET forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockGetUserProviderConfigs).not.toHaveBeenCalled()
  })

  it('GET returns configuredProviders and disables caching', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([
      { provider: 'openai' },
      { provider: 'anthropic' },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configuredProviders: ['openai', 'anthropic'],
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith({ allowGuest: true })
    expect(mockGetUserProviderConfigs).toHaveBeenCalledWith('user-1')
  })

  it('GET returns 500 when provider config lookup fails', async () => {
    mockGetUserProviderConfigs.mockRejectedValue(new Error('db unavailable'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load provider configuration',
    })

    consoleSpy.mockRestore()
  })

  it('POST returns 400 when provider is missing', async () => {
    const response = await POST(
      makePostRequest({ apiKey: 'sk-test-1234567890' })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provider is required',
    })
  })

  it('POST returns 400 for unsupported providers', async () => {
    const response = await POST(
      makePostRequest({ provider: 'unknown-provider', apiKey: 'abc1234567890' })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Unsupported provider: unknown-provider',
    })
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('POST clears provider config when apiKey is empty', async () => {
    const response = await POST(
      makePostRequest({ provider: 'OpenAI', apiKey: '   ' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mockDeleteUserProviderConfig).toHaveBeenCalledWith('user-1', 'openai')
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('POST returns 500 when clearing provider config fails', async () => {
    mockDeleteUserProviderConfig.mockRejectedValue(new Error('delete failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(
      makePostRequest({ provider: 'OpenAI', apiKey: '   ' })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to clear provider configuration',
    })
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('POST stores normalized provider key with default models and rate limits', async () => {
    const response = await POST(
      makePostRequest({ provider: 'OpenAI', apiKey: 'sk-test-1234567890' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mockStoreUserApiKey).toHaveBeenCalledWith(
      'user-1',
      'openai',
      'sk-test-1234567890',
      expect.objectContaining({
        models: expect.arrayContaining(['gpt-4']),
        rateLimits: { requests: 60, window: 60000 },
      })
    )
  })

  it('POST returns 500 when secure storage fails', async () => {
    mockStoreUserApiKey.mockRejectedValue(new Error('write failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(
      makePostRequest({ provider: 'openai', apiKey: 'sk-test-1234567890' })
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to store API key securely',
    })

    consoleSpy.mockRestore()
  })
})
