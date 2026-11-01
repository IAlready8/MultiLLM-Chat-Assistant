import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockQueryRaw = vi.fn()
const mockMetricsSnapshot = vi.fn()
const mockGetCacheDiagnostics = vi.fn()
const mockGetRateLimitDiagnostics = vi.fn()
const mockFetch = vi.fn()
const mockProbeRateLimitBackend = vi.fn()

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
  probeRateLimitBackend: () => mockProbeRateLimitBackend(),
  getRateLimitDiagnostics: () => mockGetRateLimitDiagnostics(),
}))

import { GET } from '@/app/api/health/route'

const originalFetch = global.fetch
const originalPythonCoreUrl = process.env.PYTHON_CORE_URL
const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA
const originalCommitRef = process.env.VERCEL_GIT_COMMIT_REF
const originalGithubSha = process.env.GITHUB_SHA
const originalGithubRefName = process.env.GITHUB_REF_NAME

describe('/api/health route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRaw.mockReset()
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockProbeRateLimitBackend.mockResolvedValue(undefined)
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
      scope: 'per-instance',
      message: 'Redis not configured; using per-instance in-memory rate limiting',
      redisConfigured: false,
      redisConnected: false,
      inMemoryKeys: 0,
    })
    global.fetch = mockFetch as typeof fetch
    mockFetch.mockReset()
    delete process.env.PYTHON_CORE_URL
    delete process.env.VERCEL_GIT_COMMIT_SHA
    delete process.env.VERCEL_GIT_COMMIT_REF
    delete process.env.GITHUB_SHA
    delete process.env.GITHUB_REF_NAME
  })

  afterEach(() => {
    vi.useRealTimers()
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
    if (originalGithubSha === undefined) {
      delete process.env.GITHUB_SHA
    } else {
      process.env.GITHUB_SHA = originalGithubSha
    }
    if (originalGithubRefName === undefined) {
      delete process.env.GITHUB_REF_NAME
    } else {
      process.env.GITHUB_REF_NAME = originalGithubRefName
    }
  })

  it('returns healthy status when database check succeeds', async () => {
    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.source).toBe('health')
    expect(payload.status).toBe('healthy')
    expect(payload.generatedAt).toBeTypeOf('string')
    expect(payload.timestamp).toBe(payload.generatedAt)
    expect(payload.responseTimeMs).toBeTypeOf('number')
    expect(payload.responseTime).toBe(payload.responseTimeMs)
    expect(payload.checks.database.status).toBe('connected')
    expect(payload.checks.database.responseTimeMs).toBeTypeOf('number')
    expect(payload.checks.database.responseTime).toBe(
      payload.checks.database.responseTimeMs
    )
    expect(payload.checks.cache.status).toBe('memory')
    expect(payload.checks.cache.responseTimeMs).toBeTypeOf('number')
    expect(payload.checks.cache.responseTime).toBe(
      payload.checks.cache.responseTimeMs
    )
    expect(payload.checks.cache.message).toBe(
      'Redis not configured; using in-memory cache'
    )
    expect(payload.checks.rateLimit.status).toBe('memory')
    expect(payload.checks.rateLimit.responseTimeMs).toBeTypeOf('number')
    expect(payload.checks.rateLimit.responseTime).toBe(
      payload.checks.rateLimit.responseTimeMs
    )
    expect(payload.checks.rateLimit.message).toBe(
      'Redis not configured; using per-instance in-memory rate limiting'
    )
    expect(payload.checks.rateLimit.scope).toBe('per-instance')
    expect(payload.checks.sidecar.status).toBe('disabled')
    expect(payload.checks.sidecar.responseTimeMs).toBeTypeOf('number')
    expect(payload.checks.sidecar.responseTime).toBe(
      payload.checks.sidecar.responseTimeMs
    )
    expect(payload.checks.api.responseTimeMs).toBeTypeOf('number')
    expect(payload.checks.api.responseTime).toBe(
      payload.checks.api.responseTimeMs
    )
    expect(payload.version).toBe('0.2.0-private-pilot.3')
    expect(payload.release).toEqual({
      version: '0.2.0-private-pilot.3',
      commitSha: null,
      commitShort: null,
      branch: null,
    })
    expect(payload.summary).toEqual({
      coreAvailability: 'available',
      degradedChecks: [],
      alertLevel: 'none',
      shouldPage: false,
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
    expect(payload.checks.database.message).toBe('Database health check failed')
    expect(payload.summary).toEqual({
      coreAvailability: 'degraded',
      degradedChecks: ['database'],
      alertLevel: 'critical',
      shouldPage: true,
    })
  })

  it('confirms the schema columns every authenticated request depends on', async () => {
    const response = await GET(new NextRequest('http://localhost/api/health'))
    const payload = await response.json()

    expect(payload.checks.database.schema).toBe('current')
    const queries = mockQueryRaw.mock.calls.map((call) => (call[0] as TemplateStringsArray).join('?'))
    expect(queries).toEqual(['SELECT 1', 'SELECT "role", "passwordVersion" FROM "User" LIMIT 0'])
  })

  it.each([
    ['missing column', Object.assign(new Error('column "role" does not exist'), { code: 'P2010', meta: { code: '42703' } })],
    ['missing table', Object.assign(new Error('relation "User" does not exist'), { code: '42P01' })],
  ])('reports a %s as a critical schema-behind database state', async (_label, schemaError) => {
    mockQueryRaw.mockResolvedValueOnce([{ ok: 1 }]).mockRejectedValueOnce(schemaError)

    const payload = await (await GET(new NextRequest('http://localhost/api/health'))).json()

    expect(payload.status).toBe('degraded')
    expect(payload.checks.database).toMatchObject({
      status: 'degraded',
      schema: 'behind',
      message: 'Database schema is behind this release; apply pending migrations',
    })
    expect(payload.summary).toEqual({
      coreAvailability: 'degraded',
      degradedChecks: ['database'],
      alertLevel: 'critical',
      shouldPage: true,
    })
    expect(JSON.stringify(payload)).not.toContain('passwordVersion')
  })

  it('does not blame the schema for an unrelated failure of the schema query', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ ok: 1 }]).mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))

    const payload = await (await GET(new NextRequest('http://localhost/api/health'))).json()

    expect(payload.checks.database).toMatchObject({
      status: 'degraded',
      schema: 'unchecked',
      message: 'Database schema check failed',
    })
  })

  it('skips the schema query when the database is unreachable', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const payload = await (await GET(new NextRequest('http://localhost/api/health'))).json()

    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
    expect(payload.checks.database).toMatchObject({ status: 'degraded', schema: 'unchecked' })
  })

  it('does not expose connection credentials in public health errors', async () => {
    const privateConnection = 'postgresql://example:private-password@internal-db/private-database'
    mockQueryRaw.mockRejectedValue(new Error(`Connection failed: ${privateConnection}`))
    process.env.PYTHON_CORE_URL = 'http://sidecar.internal'
    mockFetch.mockRejectedValue(new Error('Cannot use credentials: http://user:private-password@sidecar.internal'))
    const response = await GET(new NextRequest('http://localhost/api/health'))
    const payload = await response.text()
    expect(payload).not.toContain('private-password')
    expect(payload).not.toContain('internal-db')
    expect(payload).not.toContain('sidecar.internal')
    expect(JSON.parse(payload).status).toBe('degraded')
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
    expect(payload.checks.sidecar.message).toBe('Python sidecar health check failed')
    expect(payload.summary).toEqual({
      coreAvailability: 'available',
      degradedChecks: ['sidecar'],
      alertLevel: 'warning',
      shouldPage: false,
    })
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
    expect(payload.summary).toEqual({
      coreAvailability: 'available',
      degradedChecks: ['cache'],
      alertLevel: 'warning',
      shouldPage: false,
    })
  })

  it('returns degraded rate-limit status when Redis is configured but unavailable', async () => {
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'degraded',
      scope: 'per-instance',
      message: 'Redis configured but unavailable; using per-instance in-memory rate limiting',
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
      'Redis configured but unavailable; using per-instance in-memory rate limiting'
    )
    expect(payload.summary).toEqual({
      coreAvailability: 'available',
      degradedChecks: ['rateLimit'],
      alertLevel: 'warning',
      shouldPage: false,
    })
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
      version: '0.2.0-private-pilot.3',
      commitSha: '38bd6ff663ad85a9586de66c42978458fd8f2c25',
      commitShort: '38bd6ff',
      branch: 'main',
    })
    expect(payload.source).toBe('health')
  })

  it('reports a hung database probe as degraded after the probe timeout', async () => {
    vi.useFakeTimers()
    mockQueryRaw.mockReturnValue(new Promise(() => {}))

    const pending = GET(new NextRequest('http://localhost/api/health'))
    await vi.advanceTimersByTimeAsync(4_999)
    let settled = false
    void pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    const response = await pending

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('degraded')
    expect(payload.checks.database).toMatchObject({
      status: 'degraded',
      message: 'Database health check timed out',
    })
    expect(payload.checks.database.responseTimeMs).toBeGreaterThanOrEqual(5_000)
    expect(payload.summary).toEqual({
      coreAvailability: 'degraded',
      degradedChecks: ['database'],
      alertLevel: 'critical',
      shouldPage: true,
    })
  })

  it('times each dependency check independently and reports the full request time', async () => {
    vi.useFakeTimers()
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockProbeRateLimitBackend.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 400)),
    )

    const pending = GET(new NextRequest('http://localhost/api/health'))
    await vi.advanceTimersByTimeAsync(400)
    const payload = await (await pending).json()

    expect(payload.status).toBe('healthy')
    // A slow rate-limit probe must not be attributed to the database check.
    expect(payload.checks.database.responseTimeMs).toBeLessThan(400)
    expect(payload.checks.rateLimit.responseTimeMs).toBeGreaterThanOrEqual(400)
    expect(payload.checks.cache.responseTimeMs).toBeLessThan(400)
    expect(payload.checks.sidecar.responseTimeMs).toBeLessThan(400)
    // The total covers the whole request instead of the setup before any check ran.
    expect(payload.responseTimeMs).toBeGreaterThanOrEqual(400)
    expect(payload.checks.api.responseTimeMs).toBe(payload.responseTimeMs)
  })

  it('is a route handler module, not a server-actions module', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../app/api/health/route.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/^\s*['"]use server['"]/m)
  })
})
