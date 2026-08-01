import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockStoreUserApiKey = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockDeleteUserProviderConfig = vi.fn()
const mockTestProviderKey = vi.fn()
const mockValidateApiKeyFormat = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
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

vi.mock('@/lib/provider-key-test', () => ({
  testProviderKey: (provider: string, apiKey: string) =>
    mockTestProviderKey(provider, apiKey),
  validateApiKeyFormat: (provider: string, apiKey: string) =>
    mockValidateApiKeyFormat(provider, apiKey),
}))

import {
  GET,
  POST,
  PUT,
  DELETE,
} from '@/app/api/provider-configs/route'
import { clearApiReadCache } from '@/lib/api-read-cache'

const makeRequest = (
  body: Record<string, unknown>,
  method: 'POST' | 'PUT' = 'POST'
) =>
  new NextRequest('http://localhost/api/provider-configs', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/provider-configs route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ENABLE_API_READ_CACHE
    delete process.env.API_READ_CACHE_TTL_MS
    clearApiReadCache()
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
    })
    mockValidateApiKeyFormat.mockReturnValue(null)
  })

  it('GET returns stored provider configs with redacted apiKey field', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        id: 'cfg-1',
        provider: 'openai',
        isActive: true,
        settings: {
          models: ['gpt-4'],
          rateLimits: { requests: 15, window: 60000 },
          baseUrl: 'https://api.openai.com/v1',
        },
        createdAt: now,
        updatedAt: now,
      },
    ])

    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.configs.openai).toMatchObject({
      provider: 'openai',
      isActive: true,
      apiKey: '',
      models: ['gpt-4'],
      rateLimits: { requests: 15, window: 60000 },
    })
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith()
  })

  it('GET serves cached provider configs when read cache is enabled', async () => {
    process.env.ENABLE_API_READ_CACHE = 'true'
    process.env.API_READ_CACHE_TTL_MS = '60000'
    const now = new Date('2026-01-01T00:00:00.000Z')
    mockGetUserProviderConfigs.mockResolvedValue([
      {
        id: 'cfg-1',
        provider: 'openai',
        isActive: true,
        settings: {
          models: ['gpt-4'],
          rateLimits: { requests: 15, window: 60000 },
        },
        createdAt: now,
        updatedAt: now,
      },
    ])

    const first = await GET()
    const second = await GET()

    expect(first.headers.get('X-Read-Cache')).toBe('miss')
    expect(second.headers.get('X-Read-Cache')).toBe('hit')
    expect(mockGetUserProviderConfigs).toHaveBeenCalledTimes(1)
  })

  it('POST rejects unsupported providers', async () => {
    const response = await POST(
      makeRequest({
        provider: 'unknown-provider',
        config: { apiKey: 'sk-test-1234567890' },
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Unsupported provider: unknown-provider',
    })
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('POST preserves passthrough config fields in settings payload', async () => {
    const response = await POST(
      makeRequest({
        provider: 'openai',
        config: {
          apiKey: 'sk-test-1234567890',
          models: ['gpt-4'],
          rateLimits: { requests: 10, window: 60000 },
          baseUrl: 'https://api.openai.com/v1',
          organization: 'org_123',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(mockStoreUserApiKey).toHaveBeenCalledWith(
      'user-1',
      'openai',
      'sk-test-1234567890',
      expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        organization: 'org_123',
        models: ['gpt-4'],
      })
    )
  })

  it('POST allows optional-key providers to be saved without apiKey', async () => {
    const response = await POST(
      makeRequest({
        provider: 'ollama',
        config: {
          apiKey: '',
          baseUrl: 'http://localhost:11434',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(mockStoreUserApiKey).toHaveBeenCalledWith(
      'user-1',
      'ollama',
      '',
      expect.objectContaining({
        baseUrl: 'http://localhost:11434',
        models: expect.arrayContaining(['llama3']),
        rateLimits: { requests: 1000, window: 60000 },
      })
    )
  })

  it('POST stores DeepSeek connection settings without a credential', async () => {
    const response = await POST(
      makeRequest({
        provider: 'deepseek',
        config: {},
      })
    )

    expect(response.status).toBe(200)
    expect(mockStoreUserApiKey).toHaveBeenCalledWith(
      'user-1',
      'deepseek',
      '',
      expect.objectContaining({
        models: ['deepseek-ai/DeepSeek-V4-Flash-0731'],
        rateLimits: { requests: 12, window: 60000 },
      })
    )
  })

  it('POST invalidates cached provider configs after save', async () => {
    process.env.ENABLE_API_READ_CACHE = 'true'
    process.env.API_READ_CACHE_TTL_MS = '60000'
    const now = new Date('2026-01-01T00:00:00.000Z')
    mockGetUserProviderConfigs
      .mockResolvedValueOnce([
        {
          id: 'cfg-1',
          provider: 'openai',
          isActive: true,
          settings: { models: ['gpt-4'] },
          createdAt: now,
          updatedAt: now,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'cfg-2',
          provider: 'anthropic',
          isActive: true,
          settings: { models: ['claude-3-haiku-20240307'] },
          createdAt: now,
          updatedAt: now,
        },
      ])

    await GET()
    await POST(
      makeRequest({
        provider: 'openai',
        config: { apiKey: 'sk-test-1234567890' },
      })
    )
    const response = await GET()

    expect(response.headers.get('X-Read-Cache')).toBe('miss')
    expect(mockGetUserProviderConfigs).toHaveBeenCalledTimes(2)
  })

  it('PUT returns validation errors for bad key format', async () => {
    mockValidateApiKeyFormat.mockReturnValue('Invalid API key format')

    const response = await PUT(
      makeRequest(
        {
          provider: 'openai',
          config: { apiKey: 'invalid-format-key-12345', models: ['gpt-4'] },
        },
        'PUT'
      )
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.errors[0].message).toContain('Invalid API key format')
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('PUT maps provider 429 to rate_limited reason', async () => {
    mockTestProviderKey.mockResolvedValue({ ok: false, status: 429 })

    const response = await PUT(
      makeRequest(
        {
          provider: 'openai',
          config: { apiKey: 'sk-test-1234567890', models: ['gpt-4'] },
        },
        'PUT'
      )
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.connectionTest.reason).toBe('rate_limited')
  })

  it('DELETE clears provider config for authenticated user', async () => {
    const request = new NextRequest(
      'http://localhost/api/provider-configs?provider=openai',
      { method: 'DELETE' }
    )

    const response = await DELETE(request)

    expect(response.status).toBe(200)
    expect(mockDeleteUserProviderConfig).toHaveBeenCalledWith('user-1', 'openai')
  })

  it('forwards auth response for protected requests', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
