import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockEnsureStripeConfigured,
  mockConstructEvent,
  mockHeadersGet,
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
      retrieve: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRO_PRICE_ID: 'price_test',
  ensureStripeConfigured: (mode: 'api' | 'checkout' | 'webhook') =>
    mockEnsureStripeConfigured(mode),
  StripeConfigurationError: MockStripeConfigurationError,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      update: vi.fn(),
    },
  },
}))

import { POST } from '@/app/api/webhooks/stripe/route'

describe('/api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHeadersGet.mockReturnValue(null)
    mockEnsureStripeConfigured.mockReset()
    mockEnsureStripeConfigured.mockImplementation(() => undefined)
    mockConstructEvent.mockReset()
  })

  it('returns 400 when Stripe signature header is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{"id":"evt_1"}',
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Stripe signature',
    })
    expect(mockEnsureStripeConfigured).not.toHaveBeenCalled()
  })

  it('returns 503 when webhook configuration is missing', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockEnsureStripeConfigured.mockImplementation(() => {
      throw new MockStripeConfigurationError('Stripe webhook is not configured.')
    })

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{"id":"evt_1"}',
      })
    )

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

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{"id":"evt_1"}',
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Webhook Error' })
  })

  it('returns 200 for checkout.session.completed with metadata userId', async () => {
    mockHeadersGet.mockReturnValue('sig_test')
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {
            userId: 'user-1',
          },
        },
      },
    })

    const response = await POST(
      new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: '{"id":"evt_1"}',
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
  })
})
