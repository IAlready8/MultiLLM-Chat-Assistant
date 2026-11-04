import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const {
  mockGetAuthenticatedUser,
  mockEnsureStripeConfigured,
  mockGetOrCreateStripeCustomer,
  mockListSubscriptions,
  mockListCheckoutSessions,
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
    mockListSubscriptions: vi.fn(),
    mockListCheckoutSessions: vi.fn(),
    mockCreateCheckoutSession: vi.fn(),
    mockCreatePortalSession: vi.fn(),
    mockRecordAnalyticsEvent: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerError: vi.fn(),
    MockStripeConfigurationError,
  }
})

const billingUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ default: { user: { findUnique: billingUser } } }))
const paidSignup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/legal-publication', () => ({ isPaidSignupEnabled: paidSignup }))

vi.mock('@/lib/billing-price', () => ({ getProPrice: vi.fn().mockResolvedValue({ id: 'price_test', label: '$10 / month' }) }))

vi.mock('@/lib/billing-lock', () => ({ withBillingLock: async (_key: string, work: () => Promise<unknown>) => work() }))

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (payload: unknown, options: unknown) => mockCreateCheckoutSession(payload, options),
        list: (payload: unknown) => mockListCheckoutSessions(payload),
      },
    },
    subscriptions: {
      list: (payload: unknown) => mockListSubscriptions(payload),
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
    paidSignup.mockReturnValue(true)
    billingUser.mockResolvedValue({ id: 'user-1', deletionRequestedAt: null })
    process.env.NEXTAUTH_URL = 'http://localhost:3000'

    mockEnsureStripeConfigured.mockReset()
    mockEnsureStripeConfigured.mockImplementation(() => undefined)
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockGetOrCreateStripeCustomer.mockResolvedValue('cus_123')
    mockListSubscriptions.mockResolvedValue({ data: [] })
    mockListCheckoutSessions.mockResolvedValue({ data: [] })
    mockCreateCheckoutSession.mockResolvedValue({
      url: 'https://stripe.test/checkout',
    })
    mockCreatePortalSession.mockResolvedValue({
      url: 'https://stripe.test/portal',
    })
    mockRecordAnalyticsEvent.mockResolvedValue(undefined)
    mockLoggerWarn.mockReset()
    mockLoggerError.mockReset()
  })

  it('rejects a stale checkout authorization when deletion begins before its billing lock', async () => {
    billingUser.mockResolvedValue({ id: 'user-1', deletionRequestedAt: new Date() })
    expect((await createSubscriptionSession(new Request('http://localhost'))).status).toBe(500)
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled()
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
    expect((await createManageSession(new Request('http://localhost'))).status).toBe(500)
    expect(mockCreatePortalSession).not.toHaveBeenCalled()
  })

  it('forwards auth response for /api/subscriptions', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    )

    const response = await createSubscriptionSession(
      new Request('http://localhost'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects new paid signup before Stripe resources when notices are unpublished', async () => {
    paidSignup.mockReturnValue(false)
    const response = await createSubscriptionSession(new Request('http://localhost'))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'PAID_SIGNUP_CLOSED' })
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled()
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
    expect((await createManageSession(new Request('http://localhost'))).status).toBe(200)
  })

  it('returns 400 when authenticated user has no email', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })

    const response = await createSubscriptionSession(
      new Request('http://localhost'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'User email not found',
    })
  })

  it('returns 503 when checkout is not configured', async () => {
    mockEnsureStripeConfigured.mockImplementation(() => {
      throw new MockStripeConfigurationError('Checkout is not configured.')
    })

    const response = await createSubscriptionSession(
      new Request('http://localhost'),
    )

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
      }),
    )
  })

  it.each([createSubscriptionSession, createManageSession])('rejects invalid callback configuration before any Stripe action', async handler => {
    process.env.NEXTAUTH_URL = 'not-a-valid-url'
    expect((await handler(new Request('http://localhost'))).status).toBe(503)
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled()
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
    expect(mockCreatePortalSession).not.toHaveBeenCalled()
  })

  it('records checkout analytics with request source', async () => {
    const response = await createSubscriptionSession(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      }),
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

  it('creates hosted Checkout with durable user metadata', async () => {
    const response = await createSubscriptionSession(
      new Request('http://localhost', { method: 'POST' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: 'https://stripe.test/checkout',
      destination: 'checkout',
    })
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_123',
        client_reference_id: 'user-1',
        subscription_data: {
          billing_mode: { type: 'flexible' },
          metadata: {
            app: 'multi-llm-chat-assistant',
            tier: 'PRO',
            userId: 'user-1',
          },
        },
      }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:user-1:price_test:/) }),
    )
  })

  it('routes customers with an ongoing subscription to the portal', async () => {
    mockListSubscriptions.mockResolvedValue({
      data: [{ id: 'sub_existing', status: 'past_due' }],
    })

    const response = await createSubscriptionSession(
      new Request('http://localhost', { method: 'POST' }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: 'https://stripe.test/portal',
      destination: 'portal',
    })
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      customer: 'cus_123',
      return_url: 'http://localhost:3000/billing',
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
      'user@example.com',
    )
  })

  it('returns 503 for manage session when stripe API is not configured', async () => {
    mockEnsureStripeConfigured.mockImplementation(() => {
      throw new MockStripeConfigurationError(
        'Billing is not configured. Missing STRIPE_SECRET_KEY.',
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
      }),
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
      }),
    )
  })

  it('records portal analytics with request source', async () => {
    const response = await createManageSession(
      new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      }),
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
  it('reuses an unexpired checkout for the same user and price', async () => {
    mockListCheckoutSessions.mockResolvedValue({ data: [{ url: 'https://checkout.stripe.com/existing', expires_at: Math.floor(Date.now() / 1000) + 3600, metadata: { app: 'multi-llm-chat-assistant', userId: 'user-1', priceId: 'price_test' } }] })
    const response = await createSubscriptionSession(new Request('http://localhost'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://checkout.stripe.com/existing', destination: 'checkout' })
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  if (originalNextAuthUrl === undefined) {
    delete process.env.NEXTAUTH_URL
  } else {
    process.env.NEXTAUTH_URL = originalNextAuthUrl
  }


})
