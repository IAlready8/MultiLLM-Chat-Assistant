import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalRedisUrl = process.env.REDIS_URL

const loadModule = async () => import('@/lib/rate-limit')

describe('rate-limit diagnostics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL
    } else {
      process.env.REDIS_URL = originalRedisUrl
    }
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
})
