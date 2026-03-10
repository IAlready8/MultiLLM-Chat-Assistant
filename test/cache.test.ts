import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalRedisUrl = process.env.REDIS_URL

const loadModule = async () => import('@/lib/cache')

describe('cache diagnostics', () => {
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

    const { getCacheDiagnostics } = await loadModule()

    expect(getCacheDiagnostics()).toEqual({
      mode: 'memory',
      status: 'memory',
      message: 'Redis not configured; using in-memory cache',
      redisConfigured: false,
      redisConnected: false,
      memorySize: 0,
    })
  })

  it('reports degraded mode when Redis connect fails', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'

    const warn = vi.fn()
    const info = vi.fn()
    const on = vi.fn()
    const connect = vi.fn().mockRejectedValue(new Error('redis offline'))

    vi.doMock('@/lib/logger', () => ({
      logger: { warn, info, error: vi.fn() },
    }))

    vi.doMock('redis', () => ({
      createClient: vi.fn(() => ({
        on,
        connect,
      })),
    }))

    const { getCacheDiagnostics } = await loadModule()
    await Promise.resolve()
    await Promise.resolve()

    expect(getCacheDiagnostics()).toEqual({
      mode: 'memory',
      status: 'degraded',
      message: 'Redis configured but unavailable; using in-memory cache',
      redisConfigured: true,
      redisConnected: false,
      memorySize: 0,
    })

    expect(info).not.toHaveBeenCalledWith('cache_redis_connected')
    expect(warn).not.toHaveBeenCalledWith('cache_redis_connected')
  })
})
