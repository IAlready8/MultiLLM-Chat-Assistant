import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockStoreUserApiKey = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockDeleteUserProviderConfig = vi.fn()
const mockTestProviderKey = vi.fn()
const mockValidateApiKeyFormat = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: (event: unknown) => mockRecordAnalyticsEvent(event),
}))

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
  testProviderKey: (
    provider: string,
    apiKey: string,
    options: { baseUrl?: unknown },
  ) => mockTestProviderKey(provider, apiKey, options),
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
    vi.unstubAllEnvs()
    delete process.env.ENABLE_API_READ_CACHE
    delete process.env.API_READ_CACHE_TTL_MS
    clearApiReadCache()
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
    })
    mockValidateApiKeyFormat.mockReturnValue(null)
    mockRecordAnalyticsEvent.mockResolvedValue(undefined)
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
      {
        id: 'cfg-historical-deepseek',
        provider: 'deepseek',
        isActive: true,
        settings: { models: ['deepseek-ai/DeepSeek-V4-Flash-0731'] },
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
    expect(body.configs.deepseek).toBeUndefined()
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

  it('POST rejects nested baseUrl values that target loopback', async () => {
    const response = await POST(
      makeRequest({
        provider: 'openai',
        config: {
          apiKey: 'sk-test-1234567890',
          settings: { baseUrl: 'http://127.0.0.1:8080/v1' },
        },
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
      errors: [{ path: 'baseUrl', message: 'Provider endpoint is not allowed' }],
    })
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('PUT rejects a provider lookalike origin before testing the API key', async () => {
    const response = await PUT(
      makeRequest(
        {
          provider: 'openai',
          config: {
            apiKey: 'sk-test-1234567890',
            baseUrl: 'https://api.openai.com.evil.example/v1',
          },
        },
        'PUT',
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
      errors: [{ path: 'baseUrl', message: 'Provider endpoint is not allowed' }],
    })
    expect(mockTestProviderKey).not.toHaveBeenCalled()
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it.each([
    ['private top-level endpoint', { baseUrl: 'http://169.254.169.254:11434' }],
    [
      'private nested endpoint',
      { settings: { baseUrl: 'http://192.168.1.1:11434' } },
    ],
    ['public remote endpoint', { baseUrl: 'https://ollama.example.com' }],
    ['wrong Ollama port', { baseUrl: 'http://localhost:8080' }],
  ])('POST rejects %s before persistence', async (_label, config) => {
    process.env.ENABLE_API_READ_CACHE = 'true'
    process.env.API_READ_CACHE_TTL_MS = '60000'
    mockGetUserProviderConfigs.mockResolvedValue([])
    await GET()

    const response = await POST(
      makeRequest({ provider: 'ollama', config: { apiKey: '', ...config } }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
      errors: [{ path: 'baseUrl', message: 'Provider endpoint is not allowed' }],
    })
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()

    const cachedRead = await GET()
    expect(cachedRead.headers.get('X-Read-Cache')).toBe('hit')
  })

  it('POST rejects Ollama in production mode before persistence', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await POST(
      makeRequest({
        provider: 'ollama',
        config: { apiKey: '', baseUrl: 'http://localhost:11434' },
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
    })
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it.each([
    ['private top-level endpoint', { baseUrl: 'http://169.254.169.254:11434' }],
    [
      'private nested endpoint',
      { settings: { baseUrl: 'http://10.0.0.1:11434' } },
    ],
    ['public remote endpoint', { baseUrl: 'https://ollama.example.com' }],
    ['wrong Ollama port', { baseUrl: 'http://localhost:8080' }],
  ])('PUT rejects %s before connection testing', async (_label, config) => {
    const response = await PUT(
      makeRequest(
        { provider: 'ollama', config: { apiKey: '', ...config } },
        'PUT',
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
      errors: [{ path: 'baseUrl', message: 'Provider endpoint is not allowed' }],
    })
    expect(mockTestProviderKey).not.toHaveBeenCalled()
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('PUT rejects Ollama in production mode before connection testing', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await PUT(
      makeRequest(
        {
          provider: 'ollama',
          config: { apiKey: '', baseUrl: 'http://localhost:11434' },
        },
        'PUT',
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
    })
    expect(mockTestProviderKey).not.toHaveBeenCalled()
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('validates the effective top-level baseUrl after nested settings merge', async () => {
    const rejected = await POST(
      makeRequest({
        provider: 'ollama',
        config: {
          apiKey: '',
          baseUrl: 'http://169.254.169.254:11434',
          settings: { baseUrl: 'http://localhost:11434' },
        },
      }),
    )

    expect(rejected.status).toBe(400)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()

    const accepted = await POST(
      makeRequest({
        provider: 'ollama',
        config: {
          apiKey: '',
          baseUrl: 'http://localhost:11434',
          settings: { baseUrl: 'http://169.254.169.254:11434' },
        },
      }),
    )

    expect(accepted.status).toBe(200)
    expect(mockStoreUserApiKey).toHaveBeenCalledWith(
      'user-1',
      'ollama',
      '',
      expect.objectContaining({ baseUrl: 'http://localhost:11434' }),
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

  it('POST rejects disabled DeepSeek without requesting a key or storing config', async () => {
    const response = await POST(
      makeRequest({
        provider: 'deepseek',
        config: {},
      })
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'DeepSeek is currently unavailable.',
      code: 'PROVIDER_DISABLED',
    })
    expect(mockValidateApiKeyFormat).not.toHaveBeenCalled()
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('PUT rejects disabled DeepSeek before connection testing', async () => {
    const response = await PUT(
      makeRequest({ provider: 'deepseek', config: {} }, 'PUT')
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'PROVIDER_DISABLED',
    })
    expect(mockValidateApiKeyFormat).not.toHaveBeenCalled()
    expect(mockTestProviderKey).not.toHaveBeenCalled()
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
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

  it('PUT passes the resolved Ollama endpoint to the connection test', async () => {
    mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })

    const response = await PUT(
      makeRequest(
        {
          provider: 'ollama',
          config: {
            apiKey: '',
            baseUrl: 'http://127.0.0.2:11434',
          },
        },
        'PUT',
      ),
    )

    expect(response.status).toBe(200)
    expect(mockTestProviderKey).toHaveBeenCalledWith(
      'ollama',
      '',
      { baseUrl: 'http://127.0.0.2:11434' },
    )
    expect(mockStoreUserApiKey).toHaveBeenCalledWith(
      'user-1',
      'ollama',
      '',
      expect.objectContaining({ baseUrl: 'http://127.0.0.2:11434' }),
    )
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
  it.each(['POST', 'PUT'] as const)('%s preserves provider-configured analytics without credentials', async (method) => {
    mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })
    const invoke = method === 'POST' ? POST : PUT
    const response = await invoke(makeRequest({
      provider: 'openai', config: { apiKey: 'synthetic-primary-credential', models: ['gpt-4'] },
    }, method))

    expect(response.status).toBe(200)
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledExactlyOnceWith({
      event: 'provider_configured', userId: 'user-1', payload: { provider: 'openai' },
    })
  })

  it.each(['POST', 'PUT'] as const)('%s still saves when optional analytics fails', async (method) => {
    mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })
    mockRecordAnalyticsEvent.mockRejectedValueOnce(new Error('analytics unavailable'))
    const invoke = method === 'POST' ? POST : PUT
    const response = await invoke(makeRequest({
      provider: 'openai', config: { apiKey: 'synthetic-primary-credential', models: ['gpt-4'] },
    }, method))

    expect(response.status).toBe(200)
    expect(mockStoreUserApiKey).toHaveBeenCalledOnce()
    await expect(response.json()).resolves.toMatchObject({ success: true })
  })

  it('PUT returns validated public settings without echoing the submitted credential', async () => {
    mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })
    const credential = 'synthetic-submitted-provider-credential'
    const response = await PUT(makeRequest({
      provider: 'openai',
      config: {
        apiKey: credential,
        baseUrl: 'https://api.openai.com/v1',
        organization: 'org-public-setting',
        models: ['gpt-4'],
        settings: { maxTokens: 2048 },
      },
    }, 'PUT'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      success: true,
      data: {
        apiKey: '', organization: 'org-public-setting', models: ['gpt-4'],
        settings: { baseUrl: 'https://api.openai.com/v1', maxTokens: 2048 },
      },
      connectionTest: { success: true },
    })
    expect(JSON.stringify(body)).not.toContain(credential)
    expect(body.data.settings).not.toHaveProperty('apiKey')
    expect(mockStoreUserApiKey).toHaveBeenCalledWith('user-1', 'openai', credential,
      expect.objectContaining({ maxTokens: 2048 }))
  })

  describe.each(['POST', 'PUT'] as const)('%s settings boundary', (method) => {
    it.each([
      { settings: { apiKey: 'synthetic-nested-credential' } },
      { settings: { 'API_KEY': 'synthetic-nested-credential' } },
      { authorization: 'synthetic-nested-credential' },
      { settings: { headers: [{ 'X-API-Key': 'synthetic-nested-credential' }] } },
      { settings: { safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE', credentials: { password: 'synthetic-nested-credential' } }] } },
      { rateLimits: { requests: 10, window: 60000, token: 'synthetic-nested-credential' } },
      { models: [{ accessToken: 'synthetic-nested-credential' }] },
    ])('rejects credentials anywhere in settings before testing or saving %#', async (extra) => {
      mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })
      const invoke = method === 'POST' ? POST : PUT
      const response = await invoke(makeRequest({
        provider: 'openai', config: { apiKey: 'synthetic-primary-credential', ...extra },
      }, method))

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toMatchObject({ success: false, code: 'PROVIDER_SETTINGS_INVALID' })
      expect(JSON.stringify(body)).not.toContain('synthetic-nested-credential')
      expect(mockTestProviderKey).not.toHaveBeenCalled()
      expect(mockStoreUserApiKey).not.toHaveBeenCalled()
      expect(mockRecordAnalyticsEvent).not.toHaveBeenCalled()
    })

    it.each([
      { unsupportedExtension: 'not silently discarded' },
      { settings: { unsupportedExtension: 'not silently discarded' } },
      { settings: [] },
      { models: ['gpt-4', 42] },
      { rateLimits: { requests: 0, window: 60000 } },
    ])('rejects unsupported or malformed settings %#', async (extra) => {
      mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })
      const invoke = method === 'POST' ? POST : PUT
      const response = await invoke(makeRequest({
        provider: 'openai', config: { apiKey: 'synthetic-primary-credential', ...extra },
      }, method))
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ code: 'PROVIDER_SETTINGS_INVALID' })
      expect(mockTestProviderKey).not.toHaveBeenCalled()
      expect(mockStoreUserApiKey).not.toHaveBeenCalled()
    })

    it('preserves supported settings, token limits and top-level precedence', async () => {
      mockTestProviderKey.mockResolvedValue({ ok: true, status: 200 })
      const settings = {
        baseUrl: 'https://api.openai.com/v1', organization: 'org-safe', maxTokens: 2048,
        version: '2023-06-01', httpReferer: 'https://example.test', xTitle: 'Example',
        safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }],
        isActive: true,
      }
      const invoke = method === 'POST' ? POST : PUT
      const response = await invoke(makeRequest({
        provider: 'openai', config: { apiKey: 'synthetic-primary-credential', settings,
          maxTokens: 4096, models: ['gpt-4'], rateLimits: { requests: 10, window: 60000 } },
      }, method))
      expect(response.status).toBe(200)
      expect(mockStoreUserApiKey).toHaveBeenCalledWith('user-1', 'openai',
        'synthetic-primary-credential', { ...settings, maxTokens: 4096,
          models: ['gpt-4'], rateLimits: { requests: 10, window: 60000 } })
    })
  })

  it('GET recursively removes legacy credential fields without changing stored shapes or cache safety', async () => {
    process.env.ENABLE_API_READ_CACHE = 'true'
    const legacy = {
      models: ['gpt-4'], rateLimits: { requests: 10, window: 60000 }, maxTokens: 4096,
      api_key: 'synthetic-legacy-credential',
      metadata: { label: 'preserved extension', entries: [{ region: 'local',
        Authorization: 'synthetic-legacy-credential', 'X-API-Key': 'synthetic-legacy-credential',
        deeper: { refresh_token: 'synthetic-legacy-credential', enabled: true } }] },
    }
    const original = JSON.parse(JSON.stringify(legacy))
    mockGetUserProviderConfigs.mockResolvedValue([{ provider: 'openai', isActive: true, settings: legacy }])
    for (const source of ['miss', 'hit']) {
      const response = await GET()
      expect(response.status).toBe(200)
      expect(response.headers.get('X-Read-Cache')).toBe(source)
      const body = await response.json()
      expect(JSON.stringify(body)).not.toContain('synthetic-legacy-credential')
      expect(body.configs.openai.settings).toEqual({
        models: ['gpt-4'], rateLimits: { requests: 10, window: 60000 }, maxTokens: 4096,
        metadata: { label: 'preserved extension', entries: [{ region: 'local', deeper: { enabled: true } }] },
      })
    }
    expect(legacy).toEqual(original)
    expect(mockGetUserProviderConfigs).toHaveBeenCalledTimes(1)
    expect(mockGetUserProviderConfigs).toHaveBeenCalledWith('user-1')
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

})
