import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
describe('isolated preview billing mode', () => {
  it.each(['sk_live_synthetic_only', 'rk_live_synthetic_only'])('rejects inherited live key %s before any Stripe API call', async key => {
    vi.resetModules()
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('STRIPE_SECRET_KEY', key)
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'synthetic'); vi.stubEnv('STRIPE_PRO_PRICE_ID', 'synthetic')
    const billing = await import('@/lib/stripe')
    expect(billing.isStripeApiConfigured).toBe(false)
    expect(billing.isStripeCheckoutConfigured).toBe(false)
    expect(billing.isStripeWebhookConfigured).toBe(false)
    for (const mode of ['api', 'checkout', 'webhook'] as const) expect(() => billing.ensureStripeConfigured(mode)).toThrow('Preview billing requires Stripe sandbox credentials.')
  })
  it('permits sandbox credentials in preview', async () => {
    vi.resetModules()
    vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_only')
    const billing = await import('@/lib/stripe')
    expect(billing.isStripeApiConfigured).toBe(true)
    expect(() => billing.ensureStripeConfigured('api')).not.toThrow()
  })
})
