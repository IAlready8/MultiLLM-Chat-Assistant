import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const stripeState = vi.hoisted(() => ({
  apiConfigured: true,
  checkoutConfigured: true,
  webhookConfigured: true,
}))

const mockGetAuthenticatedUser = vi.fn()
const mockQueryRaw = vi.fn()
const mockGetCacheDiagnostics = vi.fn()
const mockGetRateLimitDiagnostics = vi.fn()
const mockIsStrictAuthRequired = vi.fn()
const mockGetSidecarDiagnostics = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedAdmin: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

vi.mock('@/lib/cache', () => ({
  getCacheDiagnostics: () => mockGetCacheDiagnostics(),
}))

vi.mock('@/lib/rate-limit', () => ({
  getRateLimitDiagnostics: () => mockGetRateLimitDiagnostics(),
}))

vi.mock('@/lib/sidecar-health', () => ({
  getSidecarDiagnostics: () => mockGetSidecarDiagnostics(),
}))

vi.mock('@/lib/demo-account', () => ({
  isStrictAuthRequired: () => mockIsStrictAuthRequired(),
}))

vi.mock('@/lib/stripe', () => ({
  get isStripeApiConfigured() {
    return stripeState.apiConfigured
  },
  get isStripeCheckoutConfigured() {
    return stripeState.checkoutConfigured
  },
  get isStripeWebhookConfigured() {
    return stripeState.webhookConfigured
  },
}))

import { GET } from '@/app/api/admin/status/route'

const routeContext = { params: Promise.resolve({}) }

const originalNodeEnv = process.env.NODE_ENV
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
const originalNextAuthUrl = process.env.NEXTAUTH_URL
const originalDatabaseUrl = process.env.DATABASE_URL
const originalApiSeed = process.env.API_KEY_ENCRYPTION_SEED
const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA
const originalCommitRef = process.env.VERCEL_GIT_COMMIT_REF
const originalGithubSha = process.env.GITHUB_SHA
const originalGithubRefName = process.env.GITHUB_REF_NAME

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

describe('/api/admin/status route', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    setEnvVar('NODE_ENV', 'development')
    setEnvVar('NEXTAUTH_SECRET', 'test-secret-123')
    setEnvVar('NEXTAUTH_URL', 'http://localhost:3000')
    setEnvVar('DATABASE_URL', 'postgresql://localhost:5432/test')
    setEnvVar('API_KEY_ENCRYPTION_SEED', 'seed-123')
    setEnvVar('VERCEL_GIT_COMMIT_SHA', undefined)
    setEnvVar('VERCEL_GIT_COMMIT_REF', undefined)
    setEnvVar('GITHUB_SHA', undefined)
    setEnvVar('GITHUB_REF_NAME', undefined)

    stripeState.apiConfigured = true
    stripeState.checkoutConfigured = true
    stripeState.webhookConfigured = true

    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1', role: 'OWNER' },
    })
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockIsStrictAuthRequired.mockReturnValue(false)
    mockGetCacheDiagnostics.mockReturnValue({
      mode: 'redis',
      status: 'connected',
      message: 'Redis-backed cache is connected',
      redisConfigured: true,
      redisConnected: true,
      memorySize: 0,
    })
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'redis',
      status: 'connected',
      message: 'Redis-backed rate limiting is connected',
      redisConfigured: true,
      redisConnected: true,
      inMemoryKeys: 0,
    })
    mockGetSidecarDiagnostics.mockResolvedValue({
      status: 'disabled',
      message: 'Python sidecar not configured',
      configured: false,
    })
  })

  afterEach(() => {
    setEnvVar('NODE_ENV', originalNodeEnv)
    setEnvVar('NEXTAUTH_SECRET', originalNextAuthSecret)
    setEnvVar('NEXTAUTH_URL', originalNextAuthUrl)
    setEnvVar('DATABASE_URL', originalDatabaseUrl)
    setEnvVar('API_KEY_ENCRYPTION_SEED', originalApiSeed)
    setEnvVar('VERCEL_GIT_COMMIT_SHA', originalCommitSha)
    setEnvVar('VERCEL_GIT_COMMIT_REF', originalCommitRef)
    setEnvVar('GITHUB_SHA', originalGithubSha)
    setEnvVar('GITHUB_REF_NAME', originalGithubRefName)
  })

  it('forwards auth failure response', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for non-admin users', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    )

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('returns live status checks with overall ok when probes pass', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.source).toBe('admin-status')
    expect(payload.generatedAt).toBeTypeOf('string')
    expect(payload.overallStatus).toBe('ok')
    expect(payload.checks).toHaveLength(8)
    expect(payload.version).toBe('0.1.0')
    expect(payload.release).toEqual({
      version: '0.1.0',
      commitSha: null,
      commitShort: null,
      branch: null,
    })
    expect(payload.systemInfo.databaseUrlConfigured).toBe(true)
    expect(payload.systemInfo.sidecar.status).toBe('disabled')
    expect(payload.systemInfo.cache.mode).toBe('redis')
    expect(payload.systemInfo.rateLimit.mode).toBe('redis')
    expect(payload.systemInfo.stripe.apiConfigured).toBe(true)
    const cacheCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'cache'
    )
    expect(cacheCheck.message).toBe('Redis-backed cache is connected')
    const rateLimitCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'rate-limit'
    )
    expect(rateLimitCheck.message).toBe('Redis-backed rate limiting is connected')
    const sidecarCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'sidecar'
    )
    expect(sidecarCheck.message).toBe('Python sidecar not configured')
  })

  it('returns warning status when database is unavailable and fallback is active', async () => {
    mockQueryRaw.mockRejectedValue(
      new Error('Database access is not available in this environment.')
    )

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )
    const payload = await response.json()
    const databaseCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'database'
    )

    expect(response.status).toBe(200)
    expect(payload.overallStatus).toBe('warning')
    expect(databaseCheck.status).toBe('warning')
    expect(databaseCheck.message).toContain('in-memory fallback')
  })

  it('returns error when strict auth is enabled without NEXTAUTH_SECRET', async () => {
    mockIsStrictAuthRequired.mockReturnValue(true)
    setEnvVar('NEXTAUTH_SECRET', undefined)

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )
    const payload = await response.json()
    const authCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'auth'
    )

    expect(response.status).toBe(200)
    expect(payload.overallStatus).toBe('error')
    expect(authCheck.status).toBe('error')
    expect(authCheck.message).toContain('NEXTAUTH_SECRET is missing')
  })

  it('returns warning rate-limit status when Redis is configured but unavailable', async () => {
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'degraded',
      message: 'Redis configured but unavailable; using in-memory rate limiting',
      redisConfigured: true,
      redisConnected: false,
      inMemoryKeys: 4,
    })

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )
    const payload = await response.json()
    const rateLimitCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'rate-limit'
    )

    expect(response.status).toBe(200)
    expect(rateLimitCheck.status).toBe('warning')
    expect(rateLimitCheck.message).toBe(
      'Redis configured but unavailable; using in-memory rate limiting'
    )
  })

  it('returns warning cache status when Redis is configured but unavailable', async () => {
    mockGetCacheDiagnostics.mockReturnValue({
      mode: 'memory',
      status: 'degraded',
      message: 'Redis configured but unavailable; using in-memory cache',
      redisConfigured: true,
      redisConnected: false,
      memorySize: 4,
    })

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )
    const payload = await response.json()
    const cacheCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'cache'
    )

    expect(response.status).toBe(200)
    expect(payload.overallStatus).toBe('warning')
    expect(payload.systemInfo.cache.mode).toBe('memory')
    expect(cacheCheck.status).toBe('warning')
    expect(cacheCheck.message).toBe(
      'Redis configured but unavailable; using in-memory cache'
    )
  })

  it('returns warning sidecar status when the optional Python service is degraded', async () => {
    mockGetSidecarDiagnostics.mockResolvedValue({
      status: 'degraded',
      message: 'Python sidecar health check failed (503)',
      configured: true,
    })

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )
    const payload = await response.json()
    const sidecarCheck = payload.checks.find(
      (check: { id: string }) => check.id === 'sidecar'
    )

    expect(response.status).toBe(200)
    expect(payload.overallStatus).toBe('warning')
    expect(payload.systemInfo.sidecar.status).toBe('degraded')
    expect(sidecarCheck.status).toBe('warning')
    expect(sidecarCheck.message).toBe('Python sidecar health check failed (503)')
  })

  it('includes release commit metadata when deploy env is present', async () => {
    setEnvVar(
      'VERCEL_GIT_COMMIT_SHA',
      '38bd6ff663ad85a9586de66c42978458fd8f2c25'
    )
    setEnvVar('VERCEL_GIT_COMMIT_REF', 'main')

    const response = await GET(
      new Request('http://localhost/api/admin/status'),
      routeContext
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.source).toBe('admin-status')
    expect(payload.release).toEqual({
      version: '0.1.0',
      commitSha: '38bd6ff663ad85a9586de66c42978458fd8f2c25',
      commitShort: '38bd6ff',
      branch: 'main',
    })
  })
})
