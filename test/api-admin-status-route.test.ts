import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const stripeState = vi.hoisted(() => ({
  apiConfigured: true,
  checkoutConfigured: true,
  webhookConfigured: true,
}))

const mockGetAuthenticatedUser = vi.fn()
const mockQueryRaw = vi.fn()
const mockGetRateLimitDiagnostics = vi.fn()
const mockIsStrictAuthRequired = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedAdmin: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  getRateLimitDiagnostics: () => mockGetRateLimitDiagnostics(),
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

    stripeState.apiConfigured = true
    stripeState.checkoutConfigured = true
    stripeState.webhookConfigured = true

    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1', role: 'OWNER' },
    })
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockIsStrictAuthRequired.mockReturnValue(false)
    mockGetRateLimitDiagnostics.mockReturnValue({
      mode: 'redis',
      redisConfigured: true,
      redisConnected: true,
      inMemoryKeys: 0,
    })
  })

  afterEach(() => {
    setEnvVar('NODE_ENV', originalNodeEnv)
    setEnvVar('NEXTAUTH_SECRET', originalNextAuthSecret)
    setEnvVar('NEXTAUTH_URL', originalNextAuthUrl)
    setEnvVar('DATABASE_URL', originalDatabaseUrl)
    setEnvVar('API_KEY_ENCRYPTION_SEED', originalApiSeed)
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

    expect(payload.overallStatus).toBe('ok')
    expect(payload.checks).toHaveLength(6)
    expect(payload.systemInfo.databaseUrlConfigured).toBe(true)
    expect(payload.systemInfo.rateLimit.mode).toBe('redis')
    expect(payload.systemInfo.stripe.apiConfigured).toBe(true)
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
})
