import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockQueryRaw = vi.fn()
const mockMetricsSnapshot = vi.fn()
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

vi.mock('@/lib/rate-limit', () => ({
  getRateLimitDiagnostics: () => mockGetRateLimitDiagnostics(),
}))

import { GET } from '@/app/api/health/route'

const originalFetch = global.fetch
const originalPythonCoreUrl = process.env.PYTHON_CORE_URL

describe('/api/health route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockMetricsSnapshot.mockReturnValue({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {},
    })
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'memory',
      redisConfigured: false,
      redisConnected: false,
      inMemoryKeys: 0,
    })
    global.fetch = mockFetch as typeof fetch
    mockFetch.mockReset()
    delete process.env.PYTHON_CORE_URL
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalPythonCoreUrl === undefined) {
      delete process.env.PYTHON_CORE_URL
    } else {
      process.env.PYTHON_CORE_URL = originalPythonCoreUrl
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
    expect(payload.checks.sidecar.status).toBe('disabled')
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
    expect(payload.checks.sidecar.url).toBe('http://127.0.0.1:8008/api/v1/health')
    expect(payload.checks.sidecar.message).toContain('ECONNREFUSED')
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
})
