import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalStripeSecret = process.env.STRIPE_SECRET_KEY

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

describe('lib/stripe getOrCreateStripeCustomer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setEnvVar('STRIPE_SECRET_KEY', 'sk_test_1234567890')
  })

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    setEnvVar('STRIPE_SECRET_KEY', originalStripeSecret)
  })

  it('returns existing customer id without creating a new customer', async () => {
    const mockFindUnique = vi
      .fn()
      .mockResolvedValue({ stripeCustomerId: 'cus_existing' })
    const mockUpsert = vi.fn()

    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        subscription: {
          findUnique: (...args: unknown[]) => mockFindUnique(...args),
          upsert: (...args: unknown[]) => mockUpsert(...args),
        },
      },
    }))

    const stripeModule = await import('@/lib/stripe')
    const retrieveSpy = vi
      .spyOn(stripeModule.stripe.customers, 'retrieve')
      .mockResolvedValue({ id: 'cus_existing', deleted: false } as never)
    const createSpy = vi.spyOn(stripeModule.stripe.customers, 'create')

    const customerId = await stripeModule.getOrCreateStripeCustomer(
      'user-1',
      'user@example.com',
    )

    expect(customerId).toBe('cus_existing')
    expect(retrieveSpy).toHaveBeenCalledWith('cus_existing')
    expect(createSpy).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('creates Stripe customer and upserts subscription row when missing', async () => {
    const mockFindUnique = vi.fn().mockResolvedValue(null)
    const mockUpsert = vi.fn().mockResolvedValue({ id: 'subscription-1' })

    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        subscription: {
          findUnique: (...args: unknown[]) => mockFindUnique(...args),
          upsert: (...args: unknown[]) => mockUpsert(...args),
        },
      },
    }))

    const stripeModule = await import('@/lib/stripe')
    const createSpy = vi
      .spyOn(stripeModule.stripe.customers, 'create')
      .mockResolvedValue({ id: 'cus_new' } as never)

    const customerId = await stripeModule.getOrCreateStripeCustomer(
      'user-2',
      'new@example.com',
    )

    expect(customerId).toBe('cus_new')
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        metadata: {
          app: 'multi-llm-chat-assistant',
          userId: 'user-2',
        },
      }),
      { idempotencyKey: 'multi-llm-customer:user-2:new' },
    )
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: 'user-2' },
      update: {
        stripeCustomerId: 'cus_new',
      },
      create: {
        userId: 'user-2',
        tier: 'FREE',
        stripeCustomerId: 'cus_new',
      },
    })
  })
})
