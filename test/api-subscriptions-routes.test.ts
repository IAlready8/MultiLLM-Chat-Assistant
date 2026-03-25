import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const {
  mockGetAuthenticatedUser,
  mockEnsureStripeConfigured,
  mockGetOrCreateStripeCustomer,
  mockCreateCheckoutSession,
  mockCreatePortalSession,
  mockRecordAnalyticsEvent,
  mockLoggerWarn,
  mockLoggerError,
  MockStripeConfigurationError,
} = vi.hoisted(() => {
  class MockStripeConfigurationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'StripeConfigurationError'
    }
  }

  return {
    mockGetAuthenticatedUser: vi.fn(),
    mockEnsureStripeConfigured: vi.fn(),
    mockGetOrCreateStripeCustomer: vi.fn(),
    mockCreateCheckoutSession: vi.fn(),
    mockCreatePortalSession: vi.fn(),
    mockRecordAnalyticsEvent: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerError: vi.fn(),
    MockStripeConfigurationError,
  }
})

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (payload: unknown) => mockCreateCheckoutSession(payload),
      },
    },
    billingPortal: {
      sessions: {
        create: (payload: unknown) => mockCreatePortalSession(payload),
      },
    },
  },
  getOrCreateStripeCustomer: (userId: string, email: string) =>
    mockGetOrCreateStripeCustomer(userId, email),
  STRIPE_PRO_PRICE_ID: 'price_test',
  StripeConfigurationError: MockStripeConfigurationError,
  getStripeConfigurationUserMessage: (mode: 'api' | 'checkout' | 'webhook') => {
    switch (mode) {
      case 'api':
        return 'Billing portal is currently unavailable.'
      case 'checkout':
        return 'Checkout is currently unavailable.'
      case 'webhook':
        return 'Webhook not configured'
      default:
        return 'Billing is currently unavailable.'
    }
  },
  ensureStripeConfigured: (mode: 'api' | 'checkout' | 'webhook') =>
    mockEnsureStripeConfigured(mode),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: (event: string, payload: unknown) => mockLoggerWarn(event, payload),
    error: (event: string, payload: unknown) => mockLoggerError(event, payload),
  },
}))

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: (payload: unknown) => mockRecordAnalyticsEvent(payload),
}))

import { POST as createSubscriptionSession } from '@/app/api/subscriptions/route'
import { POST as createManageSession } from '@/app/api/subscriptions/manage/route'

const originalNextAuthUrl = process.env.NEXTAUTH_URL

describe('subscription routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXTAUTH_URL = 'http://localhost:3000'

    mockEnsureStripeConfigured.mockReset()
    mockEnsureStripeConfigured.mockImplementation(() => undefined)
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockGetOrCreateStripeCustomer.mockResolvedValue('cus_123')
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://stripe.test/checkout' })
    mockCreatePortalSession.mockResolvedValue({ url: 'https://stripe.test/portal' })
    mockRecordAnalyticsEvent.mockResolvedValue(undefined)
    mockLoggerWarn.mockReset()
    mockLoggerError.mockReset()
  })

  it('forwards auth response for /api/subscriptions', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await createSubscriptionSession(new Request('http://localhost'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when authenticated user has no email', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })

    const response = await createSubscriptionSession(new Request('http://localhost'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'User email not found' })
  })

  it('returns 503 when checkout is not configured', async () => {
    mockEnsureStripeConfigured.mockImplementation(() => {
      throw new MockStripeConfigurationError('Checkout is not configured.')
    })

    const response = await createSubscriptionSession(new Request('http://localhost'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Checkout is currently unavailable.',
    })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'stripe_checkout_unavailable',
      expect.objectContaining({
        route: '/api/subscriptions',
        userId: 'user-1',
        reason: 'Checkout is not configured.',
      })
    )
  })

  it('falls back to localhost base URL when NEXTAUTH_URL is invalid', async () => {
    process.env.NEXTAUTH_URL = 'not-a-valid-url'

    const response = await createSubscriptionSession(new Request('http://localhost'))
    const payload = mockCreateCheckoutSession.mock.calls[0]?.[0] as {
      success_url: string
      cancel_url: string
    }

    expect(response.status).toBe(200)
    expect(payload.success_url).toBe('http://localhost:3000/billing?success=true')
    expect(payload.cancel_url).toBe('http://localhost:3000/billing?canceled=true')
  })

  it('records checkout analytics with request source', async () => {
    const response = await createSubscriptionSession(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })
    )

    expect(response.status).toBe(200)
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'billing_checkout_session_created',
      userId: 'user-1',
      payload: {
        source: 'billing_page',
        tier: 'PRO',
      },
    })
  })

  it('creates a manage session and enforces API stripe config', async () => {
    const response = await createManageSession(new Request('http://localhost'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: 'https://stripe.test/portal',
    })
    expect(mockEnsureStripeConfigured).toHaveBeenCalledWith('api')
    expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(
      'user-1',
      'user@example.com'
    )
  })

  it('returns 503 for manage session when stripe API is not configured', async () => {
    mockEnsureStripeConfigured.mockImplementation(() => {
      throw new MockStripeConfigurationError(
        'Billing is not configured. Missing STRIPE_SECRET_KEY.'
      )
    })

    const response = await createManageSession(new Request('http://localhost'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Billing portal is currently unavailable.',
    })
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'stripe_portal_unavailable',
      expect.objectContaining({
        route: '/api/subscriptions/manage',
        userId: 'user-1',
        reason: 'Billing is not configured. Missing STRIPE_SECRET_KEY.',
      })
    )
  })

  it('returns 500 for unexpected Stripe manage-session failures', async () => {
    mockCreatePortalSession.mockRejectedValue(new Error('stripe unavailable'))

    const response = await createManageSession(new Request('http://localhost'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to create portal session',
    })
    expect(mockLoggerError).toHaveBeenCalledWith(
      'stripe_portal_failed',
      expect.objectContaining({
        route: '/api/subscriptions/manage',
        userId: 'user-1',
        error: expect.any(Error),
      })
    )
  })

  it('records portal analytics with request source', async () => {
    const response = await createManageSession(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })
    )

    expect(response.status).toBe(200)
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'billing_portal_session_created',
      userId: 'user-1',
      payload: {
        source: 'billing_page',
        tier: 'PRO',
      },
    })
  })
})

afterEach(() => {
  if (originalNextAuthUrl === undefined) {
    delete process.env.NEXTAUTH_URL
  } else {
    process.env.NEXTAUTH_URL = originalNextAuthUrl
  }
})
