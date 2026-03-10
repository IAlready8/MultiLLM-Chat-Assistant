import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockQueryRaw = vi.fn()
const mockMetricsSnapshot = vi.fn()
const mockGetCacheDiagnostics = vi.fn()
const mockGetRateLimitDiagnostics = vi.fn()
const mockFetch = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

vi.mock('@/lib/api-logger', () => ({
  metrics: {
    snapshot: () => mockMetricsSnapshot(),
  },
}))

vi.mock('@/lib/cache', () => ({
  getCacheDiagnostics: () => mockGetCacheDiagnostics(),
}))

vi.mock('@/lib/rate-limit', () => ({
  getRateLimitDiagnostics: () => mockGetRateLimitDiagnostics(),
}))

import { GET } from '@/app/api/health/route'

const originalFetch = global.fetch
const originalPythonCoreUrl = process.env.PYTHON_CORE_URL
const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA
const originalCommitRef = process.env.VERCEL_GIT_COMMIT_REF

describe('/api/health route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockMetricsSnapshot.mockReturnValue({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {},
    })
    mockGetCacheDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'memory',
      message: 'Redis not configured; using in-memory cache',
      redisConfigured: false,
      redisConnected: false,
      memorySize: 0,
    })
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'memory',
      message: 'Redis not configured; using in-memory rate limiting',
      redisConfigured: false,
      redisConnected: false,
      inMemoryKeys: 0,
    })
    global.fetch = mockFetch as typeof fetch
    mockFetch.mockReset()
    delete process.env.PYTHON_CORE_URL
    delete process.env.VERCEL_GIT_COMMIT_SHA
    delete process.env.VERCEL_GIT_COMMIT_REF
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalPythonCoreUrl === undefined) {
      delete process.env.PYTHON_CORE_URL
    } else {
      process.env.PYTHON_CORE_URL = originalPythonCoreUrl
    }
    if (originalCommitSha === undefined) {
      delete process.env.VERCEL_GIT_COMMIT_SHA
    } else {
      process.env.VERCEL_GIT_COMMIT_SHA = originalCommitSha
    }
    if (originalCommitRef === undefined) {
      delete process.env.VERCEL_GIT_COMMIT_REF
    } else {
      process.env.VERCEL_GIT_COMMIT_REF = originalCommitRef
    }
  })

  it('returns healthy status when database check succeeds', async () => {
    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('healthy')
    expect(payload.checks.database.status).toBe('connected')
    expect(payload.checks.cache.status).toBe('memory')
    expect(payload.checks.cache.message).toBe(
      'Redis not configured; using in-memory cache'
    )
    expect(payload.checks.rateLimit.status).toBe('memory')
    expect(payload.checks.rateLimit.message).toBe(
      'Redis not configured; using in-memory rate limiting'
    )
    expect(payload.checks.sidecar.status).toBe('disabled')
    expect(payload.version).toBe('0.1.0')
    expect(payload.release).toEqual({
      version: '0.1.0',
      commitSha: null,
      commitShort: null,
      branch: null,
    })
    expect(payload.metrics).toBeUndefined()
  })

  it('returns degraded status when database check fails', async () => {
    mockQueryRaw.mockRejectedValue(
      new Error('Database access is not available in this environment.')
    )

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('degraded')
    expect(payload.checks.database.status).toBe('degraded')
    expect(payload.checks.database.message).toContain('in-memory fallback')
  })

  it('returns degraded status when configured sidecar is unavailable', async () => {
    process.env.PYTHON_CORE_URL = 'http://127.0.0.1:8008'
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8008'))

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('degraded')
    expect(payload.checks.sidecar.status).toBe('degraded')
    expect(payload.checks.sidecar.url).toBeUndefined()
    expect(payload.checks.sidecar.message).toContain('ECONNREFUSED')
  })

  it('returns degraded cache status when Redis is configured but unavailable', async () => {
    mockGetCacheDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'degraded',
      message: 'Redis configured but unavailable; using in-memory cache',
      redisConfigured: true,
      redisConnected: false,
      memorySize: 3,
    })

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('degraded')
    expect(payload.checks.cache.status).toBe('degraded')
    expect(payload.checks.cache.message).toBe(
      'Redis configured but unavailable; using in-memory cache'
    )
  })

  it('returns degraded rate-limit status when Redis is configured but unavailable', async () => {
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'degraded',
      message: 'Redis configured but unavailable; using in-memory rate limiting',
      redisConfigured: true,
      redisConnected: false,
      inMemoryKeys: 3,
    })

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('degraded')
    expect(payload.checks.rateLimit.status).toBe('degraded')
    expect(payload.checks.rateLimit.message).toBe(
      'Redis configured but unavailable; using in-memory rate limiting'
    )
  })

  it('includes metrics snapshot when metrics=1 query is provided', async () => {
    mockMetricsSnapshot.mockReturnValue({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {
        'GET /api/config': {
          total: 3,
          errors: 0,
          avgMs: 12,
          statusCodes: { '200': 3 },
        },
      },
    })

    const request = new NextRequest('http://localhost/api/health?metrics=1')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('healthy')
    expect(payload.metrics).toEqual({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {
        'GET /api/config': {
          total: 3,
          errors: 0,
          avgMs: 12,
          statusCodes: { '200': 3 },
        },
      },
    })
  })

  it('includes release commit metadata when deploy env is present', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA =
      '38bd6ff663ad85a9586de66c42978458fd8f2c25'
    process.env.VERCEL_GIT_COMMIT_REF = 'main'

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.release).toEqual({
      version: '0.1.0',
      commitSha: '38bd6ff663ad85a9586de66c42978458fd8f2c25',
      commitShort: '38bd6ff',
      branch: 'main',
    })
  })
})
