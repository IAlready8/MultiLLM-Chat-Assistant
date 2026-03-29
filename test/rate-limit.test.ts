import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalRedisUrl = process.env.REDIS_URL
const originalNodeEnv = process.env.NODE_ENV

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

const loadModule = async () => import('@/lib/rate-limit')

describe('rate-limit diagnostics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    setEnvVar('REDIS_URL', originalRedisUrl)
    setEnvVar('NODE_ENV', originalNodeEnv)
    vi.doUnmock('redis')
    vi.doUnmock('@/lib/logger')
  })

  it('reports memory mode when Redis is not configured', async () => {
    delete process.env.REDIS_URL

    const { getRateLimitDiagnostics, resetAll } = await loadModule()

    resetAll()

    expect(getRateLimitDiagnostics()).toEqual({
      mode: 'memory',
      status: 'memory',
      message: 'Redis not configured; using in-memory rate limiting',
      redisConfigured: false,
      redisConnected: false,
      inMemoryKeys: 0,
    })
  })

  it('reports degraded mode when Redis connect fails', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'

    const warn = vi.fn()
    const info = vi.fn()
    const error = vi.fn()
    const on = vi.fn()
    const connect = vi.fn().mockRejectedValue(new Error('redis offline'))

    vi.doMock('@/lib/logger', () => ({
      logger: { warn, info, error },
    }))

    vi.doMock('redis', () => ({
      createClient: vi.fn(() => ({
        on,
        connect,
        flushAll: vi.fn().mockResolvedValue(undefined),
      })),
    }))

    const { getRateLimitDiagnostics } = await loadModule()
    await Promise.resolve()
    await Promise.resolve()

    expect(getRateLimitDiagnostics()).toEqual({
      mode: 'memory',
      status: 'degraded',
      message: 'Redis configured but unavailable; using in-memory rate limiting',
      redisConfigured: true,
      redisConnected: false,
      inMemoryKeys: 0,
    })

    expect(warn).not.toHaveBeenCalledWith('rate_limit_redis_connected')
    expect(info).not.toHaveBeenCalledWith('rate_limit_redis_connected')
    expect(error).not.toHaveBeenCalled()
  })

  it('fails closed in production when Redis is not configured', async () => {
    setEnvVar('NODE_ENV', 'production')
    setEnvVar('REDIS_URL', undefined)

    const { checkAndConsume, getRateLimitDiagnostics } = await loadModule()

    await expect(
      checkAndConsume('auth:login:test@example.com', {
        windowMs: 60000,
        max: 5,
      })
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 60000,
      reason: 'backend_unavailable',
    })

    expect(getRateLimitDiagnostics()).toEqual({
      mode: 'memory',
      status: 'error',
      message:
        'Redis-backed rate limiting is required in production but REDIS_URL is not configured',
      redisConfigured: false,
      redisConnected: false,
      inMemoryKeys: 0,
    })
  })
})
