import { afterEach, describe, expect, it, vi } from 'vitest'
const retrieve = vi.hoisted(() => vi.fn())
vi.mock('@/lib/stripe', () => ({ stripe: { prices: { retrieve } }, STRIPE_PRO_PRICE_ID: 'price_pro', ensureStripeConfigured: vi.fn(), StripeConfigurationError: class extends Error {} }))
import { getProPrice } from '@/lib/billing-price'
const price = { id: 'price_pro', active: true, type: 'recurring', billing_scheme: 'per_unit', unit_amount: 1900, currency: 'cad', recurring: { usage_type: 'licensed', interval: 'month', interval_count: 1 } }
afterEach(() => vi.resetAllMocks())
describe('published Pro pricing', () => {
  it.each([{ active: false }, { type: 'one_time' }, { unit_amount: null }, { recurring: null }, { recurring: { usage_type: 'metered' } }])('rejects an incompatible Stripe price %#', async change => {
    retrieve.mockResolvedValue({ ...price, ...change })
    await expect(getProPrice()).rejects.toThrow(/fixed recurring/)
  })
  it('uses the configured amount and recurrence without a hardcoded dollar price', async () => {
    retrieve.mockResolvedValue(price)
    expect(await getProPrice()).toEqual({ id: 'price_pro', label: 'CA$19.00 / month' })
  })
  it.each([{ currency: 'usd' }, { unit_amount: 2000 }, { recurring: { usage_type: 'licensed', interval: 'year', interval_count: 1 } }])('rejects drift from the approved offer %#', async change => {
    retrieve.mockResolvedValue({ ...price, ...change })
    await expect(getProPrice()).rejects.toThrow(/approved CAD 19/)
  })
})
