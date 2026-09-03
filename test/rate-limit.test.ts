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
      scope: 'per-instance',
      message: 'Redis not configured; using per-instance in-memory rate limiting',
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
      scope: 'per-instance',
      message: 'Redis configured but unavailable; using per-instance in-memory rate limiting',
      redisConfigured: true,
      redisConnected: false,
      inMemoryKeys: 0,
    })

    expect(warn).not.toHaveBeenCalledWith('rate_limit_redis_connected')
    expect(info).not.toHaveBeenCalledWith('rate_limit_redis_connected')
    expect(error).not.toHaveBeenCalled()
  })

  it('uses one atomic Redis script and preserves Retry-After metadata', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'

    const evalScript = vi
      .fn()
      .mockResolvedValueOnce([1, 4, 0])
      .mockResolvedValueOnce([0, 0, 42_000])
    const connect = vi.fn().mockResolvedValue(undefined)

    vi.doMock('@/lib/logger', () => ({
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    }))
    vi.doMock('redis', () => ({
      createClient: vi.fn(() => ({
        on: vi.fn(),
        connect,
        eval: evalScript,
      })),
    }))

    const { checkAndConsume, getRateLimitDiagnostics, resetAll } =
      await loadModule()
    await vi.waitFor(() => {
      expect(getRateLimitDiagnostics().mode).toBe('redis')
    })

    await expect(
      checkAndConsume('provider:user-1:openai', {
        max: 5,
        windowMs: 60_000,
      })
    ).resolves.toEqual({ allowed: true, remaining: 4, retryAfterMs: 0 })
    await expect(
      checkAndConsume('provider:user-1:openai', {
        max: 5,
        windowMs: 60_000,
      })
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 42_000,
    })

    expect(evalScript).toHaveBeenCalledTimes(2)
    expect(evalScript.mock.calls[0][0]).toContain("redis.call('ZADD'")
    expect(evalScript.mock.calls[0][1]).toMatchObject({
      keys: ['provider:user-1:openai'],
      arguments: [expect.any(String), '60000', '5', expect.any(String)],
    })
    expect(getRateLimitDiagnostics()).toMatchObject({
      mode: 'redis',
      status: 'connected',
      scope: 'distributed',
    })

    resetAll()
    expect(evalScript).toHaveBeenCalledTimes(2)
  })
})
