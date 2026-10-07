import { afterEach, describe, expect, it, vi } from 'vitest'
const retrieve = vi.hoisted(() => vi.fn())
vi.mock('@/lib/stripe', () => ({ stripe: { prices: { retrieve } }, STRIPE_PRO_PRICE_ID: 'price_pro', ensureStripeConfigured: vi.fn(), StripeConfigurationError: class extends Error {} }))
import { getProPrice } from '@/lib/billing-price'
const price = { id: 'price_pro', active: true, type: 'recurring', billing_scheme: 'per_unit', unit_amount: 1900, currency: 'usd', recurring: { usage_type: 'licensed', interval: 'month', interval_count: 1 } }
afterEach(() => vi.resetAllMocks())
describe('published Pro pricing', () => {
  it.each([{ active: false }, { type: 'one_time' }, { unit_amount: null }, { recurring: null }, { recurring: { usage_type: 'metered' } }])('rejects an incompatible Stripe price %#', async change => {
    retrieve.mockResolvedValue({ ...price, ...change })
    await expect(getProPrice()).rejects.toThrow(/fixed recurring/)
  })
  it('uses the configured amount and recurrence without a hardcoded dollar price', async () => {
    retrieve.mockResolvedValue(price)
    expect(await getProPrice()).toEqual({ id: 'price_pro', label: '$19.00 / month' })
    retrieve.mockResolvedValue({ ...price, currency: 'jpy', unit_amount: 500 })
    expect((await getProPrice()).label).toBe('¥500 / month')
    retrieve.mockResolvedValue({ ...price, currency: 'isk', unit_amount: 500 })
    expect((await getProPrice()).label).toBe('ISK 5 / month')
  })
})
