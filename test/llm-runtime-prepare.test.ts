import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configs: vi.fn(),
  apiKey: vi.fn(),
  rateLimit: vi.fn(),
  defaults: {} as Record<string, string[]>,
}))

vi.mock('@/lib/api-key-service', () => ({
  getUserProviderConfigs: (userId: string) => mocks.configs(userId),
  getUserApiKey: (userId: string, provider: string) => mocks.apiKey(userId, provider),
}))
vi.mock('@/lib/provider-key-test', () => ({ validateApiKeyFormat: () => null }))
vi.mock('@/lib/provider-rate-limit', () => ({ checkProviderRateLimit: (...args: unknown[]) => mocks.rateLimit(...args) }))
vi.mock('@/lib/llm-quota', () => ({ reserveLlmQuota: vi.fn() }))
vi.mock('@/services/analytics-service', () => ({ recordAnalyticsEvent: vi.fn() }))
vi.mock('@/lib/providers', () => ({
  getProviderAdapter: (provider: string) => (provider === 'openai' ? { name: 'openai-adapter' } : null),
  classifyProviderError: vi.fn(),
}))
vi.mock('@/lib/config-schemas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config-schemas')>()
  return {
    ...actual,
    get defaultProviderModels() {
      return { ...actual.defaultProviderModels, ...mocks.defaults }
    },
  }
})

import { prepareProviderCall } from '@/lib/llm-runtime'
import { LlmRequestError } from '@/lib/llm-request'

const baseInput = {
  provider: 'openai',
  messages: [{ role: 'user' as const, content: 'Hello' }],
}

const configWith = (settings: Record<string, unknown>) => [{ provider: 'openai', isActive: true, settings }]

describe('prepareProviderCall model selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(mocks.defaults)) delete mocks.defaults[key]
    mocks.apiKey.mockResolvedValue('sk-test-key')
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 })
    mocks.configs.mockResolvedValue(configWith({}))
  })

  it('uses the model the caller asked for', async () => {
    mocks.configs.mockResolvedValue(configWith({ models: ['gpt-4o'] }))

    const call = await prepareProviderCall('user-1', { ...baseInput, model: 'gpt-4o-mini' })

    expect(call.request.model).toBe('gpt-4o-mini')
  })

  it('falls back to the first non-empty configured model', async () => {
    mocks.configs.mockResolvedValue(configWith({ models: ['', '   ', 'gpt-4o'] }))

    const call = await prepareProviderCall('user-1', baseInput)

    expect(call.request.model).toBe('gpt-4o')
  })

  it('ignores a malformed models setting and uses the catalog default', async () => {
    mocks.configs.mockResolvedValue(configWith({ models: 'gpt-4o' }))
    mocks.defaults.openai = ['catalog-default-model']

    const call = await prepareProviderCall('user-1', baseInput)

    expect(call.request.model).toBe('catalog-default-model')
  })

  it('refuses to build a request with no model at all', async () => {
    mocks.configs.mockResolvedValue(configWith({ models: [''] }))
    mocks.defaults.openai = []

    const error = await prepareProviderCall('user-1', baseInput).catch((caught) => caught)

    expect(error).toBeInstanceOf(LlmRequestError)
    expect(error.status).toBe(400)
    expect(error.code).toBe('MODEL_REQUIRED')
    expect(mocks.rateLimit).toHaveBeenCalledTimes(1)
  })
})
