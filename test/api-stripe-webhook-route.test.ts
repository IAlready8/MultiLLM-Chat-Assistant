import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockEnsureStripeConfigured,
  mockConstructEvent,
  mockHeadersGet,
  mockCustomerRetrieve,
  mockStripeSubscriptionRetrieve,
  mockSubscriptionFindFirst,
  mockSubscriptionUpsert,
  mockEventFind,
  mockEventCreate,
  MockStripeConfigurationError,
} = vi.hoisted(() => {
  class MockStripeConfigurationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'StripeConfigurationError'
    }
  }

  return {
    mockEnsureStripeConfigured: vi.fn(),
    mockConstructEvent: vi.fn(),
    mockHeadersGet: vi.fn(),
    mockCustomerRetrieve: vi.fn(),
    mockStripeSubscriptionRetrieve: vi.fn(),
    mockSubscriptionFindFirst: vi.fn(),
    mockSubscriptionUpsert: vi.fn(),
    mockEventFind: vi.fn(),
    mockEventCreate: vi.fn(),
    MockStripeConfigurationError,
  }
})

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => mockHeadersGet(key),
  }),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (body: string, signature: string, secret: string) =>
        mockConstructEvent(body, signature, secret),
    },
    customers: {
      retrieve: (customerId: string) => mockCustomerRetrieve(customerId),
    },
    subscriptions: {
      retrieve: (subscriptionId: string) =>
        mockStripeSubscriptionRetrieve(subscriptionId),
    },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRO_PRICE_ID: 'price_test',
  ensureStripeConfigured: (mode: 'api' | 'checkout' | 'webhook') =>
    mockEnsureStripeConfigured(mode),
  StripeConfigurationError: MockStripeConfigurationError,
}))

vi.mock('@/lib/billing-lock', () => ({
  withBillingLock: async (_key: string, work: (tx: unknown) => Promise<unknown>) => work({
    subscription: { findFirst: mockSubscriptionFindFirst, upsert: mockSubscriptionUpsert },
    stripeWebhookEvent: { findUnique: mockEventFind, create: mockEventCreate },
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
      upsert: (...args: unknown[]) => mockSubscriptionUpsert(...args),
    },
  },
}))

import { POST } from '@/app/api/webhooks/stripe/route'

const makeSubscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub_123',
  customer: 'cus_123',
  status: 'active',
  cancel_at_period_end: false,
  metadata: { userId: 'user-1' },
  items: {
    data: [
      {
        price: { id: 'price_test' },
        current_period_end: 1_900_000_000,
      },
    ],
  },
  ...overrides,
})

const postWebhook = () =>
  POST(
    new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{"id":"evt_1"}',
    }),
  )

describe('/api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventFind.mockResolvedValue(null)
    mockEventCreate.mockResolvedValue({ id: 'evt_test' })
    mockHeadersGet.mockReturnValue(null)
    mockEnsureStripeConfigured.mockImplementation(() => undefined)
    mockCustomerRetrieve.mockResolvedValue({ metadata: { userId: 'user-1' } })
    mockStripeSubscriptionRetrieve.mockResolvedValue(makeSubscription())
    mockSubscriptionFindFirst.mockResolvedValue(null)
    mockSubscriptionUpsert.mockResolvedValue({ id: 'subscription-1' })
  })

  it('returns 400 when Stripe signature header is missing', async () => {
    const response = await postWebhook()

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Stripe signature',
    })
    expect(mockEnsureStripeConfigured).not.toHaveBeenCalled()
  })

  it('returns 503 when webhook configuration is missing', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockEnsureStripeConfigured.mockImplementation(() => {
      throw new MockStripeConfigurationError(
        'Stripe webhook is not configured.',
      )
    })

    const response = await postWebhook()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Webhook not configured',
    })
  })

  it('returns 400 when signature verification fails', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })

    const response = await postWebhook()

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Webhook Error' })
  })

  it('reconciles an active Pro subscription from the latest Stripe state', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({
      id: 'evt_created',
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_123', customer: 'cus_123' } },
    })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledWith('sub_123')
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({
          stripeSubscriptionId: 'sub_123',
          stripeCustomerId: 'cus_123',
          stripeStatus: 'active',
          stripeCancelAtPeriodEnd: false,
          stripeCurrentPeriodEnd: new Date(1_900_000_000 * 1000),
          tier: 'PRO',
        }),
      }),
    )
  })

  it('revokes Pro when the latest subscription is past due', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_123',
          parent: {
            subscription_details: { subscription: 'sub_123' },
          },
        },
      },
    })
    mockStripeSubscriptionRetrieve.mockResolvedValue(
      makeSubscription({ status: 'past_due' }),
    )

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          stripeStatus: 'past_due',
          tier: 'FREE',
        }),
      }),
    )
  })

  it('uses the persisted customer mapping when subscription metadata is absent', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({
      id: 'evt_updated',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_123', customer: 'cus_123' } },
    })
    mockStripeSubscriptionRetrieve.mockResolvedValue(
      makeSubscription({ metadata: {} }),
    )
    mockSubscriptionFindFirst.mockResolvedValue({ userId: 'user-1' })

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(mockSubscriptionFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { stripeSubscriptionId: 'sub_123' },
          { stripeCustomerId: 'cus_123' },
        ],
      },
      select: { userId: true },
    })
    expect(mockCustomerRetrieve).not.toHaveBeenCalled()
  })

  it('uses the signed deleted object only when Stripe confirms the resource is missing', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    const deletedSubscription = makeSubscription({
      status: 'canceled',
      cancel_at_period_end: true,
    })
    mockConstructEvent.mockReturnValue({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: { object: deletedSubscription },
    })
    mockStripeSubscriptionRetrieve.mockRejectedValue(Object.assign(new Error('not found'), { code: 'resource_missing' }))

    const response = await postWebhook()

    expect(response.status).toBe(200)
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          stripeStatus: 'canceled',
          stripeCancelAtPeriodEnd: true,
          tier: 'FREE',
        }),
      }),
    )
  })
  it('acknowledges a duplicate event without another Stripe fetch or entitlement write', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({ id: 'evt_duplicate', type: 'customer.subscription.updated', data: { object: { id: 'sub_123', customer: 'cus_123' } } })
    mockEventFind.mockResolvedValue({ id: 'evt_duplicate' })
    expect((await postWebhook()).status).toBe(200)
    expect(mockStripeSubscriptionRetrieve).not.toHaveBeenCalled()
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
    expect(mockEventCreate).not.toHaveBeenCalled()
  })

  it('does not let a delayed old cancellation downgrade a newer subscription', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({ id: 'evt_old', type: 'customer.subscription.deleted', data: { object: { id: 'sub_123', customer: 'cus_123' } } })
    mockStripeSubscriptionRetrieve.mockResolvedValue(makeSubscription({ status: 'canceled' }))
    mockSubscriptionFindFirst.mockResolvedValue({ userId: 'user-1', stripeSubscriptionId: 'sub_new', tier: 'PRO' })
    expect((await postWebhook()).status).toBe(200)
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it('retries a deletion event after a network failure instead of trusting stale event state', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({ id: 'evt_network', type: 'customer.subscription.deleted', data: { object: makeSubscription({ status: 'canceled' }) } })
    mockStripeSubscriptionRetrieve.mockRejectedValue(new Error('Network unavailable'))
    expect((await postWebhook()).status).toBe(500)
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it('rejects conflicting account ownership even when Stripe metadata names another user', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({ id: 'evt_owner', type: 'customer.subscription.updated', data: { object: { id: 'sub_123', customer: 'cus_123' } } })
    mockSubscriptionFindFirst.mockResolvedValue({ userId: 'someone-else' })
    expect((await postWebhook()).status).toBe(500)
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it('rejects a customer mismatch in a retrieved subscription', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({ id: 'evt_customer', type: 'customer.subscription.updated', data: { object: { id: 'sub_123', customer: 'cus_123' } } })
    mockStripeSubscriptionRetrieve.mockResolvedValue(makeSubscription({ customer: 'cus_other' }))
    expect((await postWebhook()).status).toBe(500)
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it.each(['unpaid', 'incomplete', 'incomplete_expired', 'paused', 'canceled'])('does not grant entitlement for %s', async status => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({ id: 'evt_status', type: 'customer.subscription.updated', data: { object: { id: 'sub_123', customer: 'cus_123' } } })
    mockStripeSubscriptionRetrieve.mockResolvedValue(makeSubscription({ status }))
    expect((await postWebhook()).status).toBe(200)
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ tier: 'FREE', stripeStatus: status }) }))
  })

  it('verifies real Stripe signatures and rejects tampered payloads', async () => {
    const sdk = new Stripe('sk_test_synthetic_signature_test')
    const payload = JSON.stringify({ id: 'evt_signed', type: 'customer.created', data: { object: { id: 'cus_123' } } })
    mockHeadersGet.mockReturnValue(sdk.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' }))
    mockConstructEvent.mockImplementation((body, signature, secret) => sdk.webhooks.constructEvent(body, signature, secret))
    const signed = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: payload }))
    expect(signed.status).toBe(200)
    const tampered = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: payload.replace('cus_123', 'cus_intruder') }))
    expect(tampered.status).toBe(400)
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
  })

  it('rejects an oversized signed body before signature parsing', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    const response = await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: 'x'.repeat(1_048_577) }))
    expect(response.status).toBe(413)
    expect(mockConstructEvent).not.toHaveBeenCalled()
  })

})
