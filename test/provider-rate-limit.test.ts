import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
const originalRedisUrl = process.env.REDIS_URL

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

const loadModule = async () => import('@/lib/provider-rate-limit')

describe('provider rate limit', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    setEnvVar('NODE_ENV', originalNodeEnv)
    setEnvVar('REDIS_URL', originalRedisUrl)
  })

  it('limits repeated requests in non-production memory mode', async () => {
    setEnvVar('NODE_ENV', 'test')
    setEnvVar('REDIS_URL', undefined)

    const { checkProviderRateLimit } = await loadModule()

    await expect(
      checkProviderRateLimit('user-1', 'openai', { requests: 1, window: 60000 })
    ).resolves.toMatchObject({ allowed: true })
    await expect(
      checkProviderRateLimit('user-1', 'openai', { requests: 1, window: 60000 })
    ).resolves.toMatchObject({ allowed: false, reason: 'rate_limited' })
  })

  it('fails closed in production when Redis-backed rate limiting is unavailable', async () => {
    setEnvVar('NODE_ENV', 'production')
    setEnvVar('REDIS_URL', undefined)

    const { checkProviderRateLimit } = await loadModule()

    await expect(
      checkProviderRateLimit('user-1', 'openai', { requests: 10, window: 60000 })
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 60000,
      reason: 'backend_unavailable',
    })
  })
})
