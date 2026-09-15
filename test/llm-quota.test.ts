import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), subscription: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const tx = { $queryRaw: mocks.query, subscription: { findUnique: mocks.subscription }, llmQuotaUsage: { create: mocks.create } }
  return { prisma: { ...tx, $transaction: async (work: (client: typeof tx) => unknown) => work(tx) } }
})
import { reserveLlmQuota, readQuotaLimits, getLlmQuota } from '@/lib/llm-quota'
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('LLM_MONTHLY_REQUEST_LIMITS', '{"FREE":2,"PRO":10,"ENTERPRISE":null}')
  vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_pro')
  mocks.query.mockResolvedValue([{ used: '0' }])
  mocks.subscription.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllEnvs())
describe('atomic server quota reservations', () => {
  it('reserves before dispatch under an account lock, independently of conversation deletion', async () => {
    await reserveLlmQuota('user')
    expect(mocks.query.mock.calls[0][1]).toBe('llm-quota:user')
    expect(mocks.create).toHaveBeenCalledWith({ data: { id: expect.any(String), userId: 'user', units: 1, createdAt: expect.any(Date) } })
  })
  it('rejects over-limit batches without writing a reservation', async () => {
    mocks.query.mockResolvedValue([{ used: '1' }])
    await expect(reserveLlmQuota('user', 2)).rejects.toMatchObject({ status: 429, code: 'QUOTA_EXCEEDED' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each(['past_due', 'canceled', 'unpaid'])('does not trust a stale Pro tier for %s', async stripeStatus => {
    mocks.subscription.mockResolvedValue({ tier: 'PRO', stripePriceId: 'price_pro', stripeStatus, stripeCurrentPeriodEnd: new Date(Date.now() + 86400000) })
    await expect(reserveLlmQuota('user', 3)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })
  it('grants the configured paid allowance only for an unexpired paid entitlement', async () => {
    mocks.subscription.mockResolvedValue({ tier: 'PRO', stripePriceId: 'price_pro', stripeStatus: 'active', stripeCurrentPeriodEnd: new Date(Date.now() + 86400000) })
    await reserveLlmQuota('user', 3)
    expect(mocks.create).toHaveBeenCalled()
    mocks.subscription.mockResolvedValue({ tier: 'PRO', stripePriceId: 'price_pro', stripeStatus: 'active', stripeCurrentPeriodEnd: new Date(0) })
    await expect(reserveLlmQuota('user', 3)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })
  it('reports the same usage and UTC reset used by enforcement', async () => {
    mocks.query.mockResolvedValue([{ used: '1' }])
    expect(await getLlmQuota('user')).toMatchObject({ tier: 'FREE', used: 1, limit: 2, resetsAt: expect.stringMatching(/01T00:00:00.000Z$/) })
  })
  it('rejects invalid configuration and does not invent commercial limits', async () => {
    vi.stubEnv('LLM_MONTHLY_REQUEST_LIMITS', '{"FREE":-1}')
    expect(readQuotaLimits).toThrow(/limits/)
    vi.stubEnv('LLM_MONTHLY_REQUEST_LIMITS', '')
    await reserveLlmQuota('user')
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
