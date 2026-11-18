import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountDeletion } from '@/types/prisma'

const mocks = vi.hoisted(() => {
  const delegate = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() })
  return { db: { accountDeletion: delegate(), user: delegate(), subscription: delegate(), analytics: delegate(), stripeWebhookEvent: delegate(), $queryRaw: vi.fn() },
    checkoutList: vi.fn(), checkoutExpire: vi.fn(), checkoutRetrieve: vi.fn(), subscriptionsList: vi.fn(), cancel: vi.fn(), configured: vi.fn(), invalidate: vi.fn(), clear: vi.fn() }
})
vi.mock('@/lib/prisma', () => ({ default: mocks.db }))
vi.mock('@/lib/billing-lock', () => ({ withBillingLock: async (_key: string, work: (tx: unknown) => Promise<unknown>) => work(mocks.db) }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { list: mocks.checkoutList, expire: mocks.checkoutExpire, retrieve: mocks.checkoutRetrieve } }, subscriptions: { list: mocks.subscriptionsList, cancel: mocks.cancel } }, ensureStripeConfigured: mocks.configured }))
vi.mock('@/lib/api-read-cache', () => ({ invalidateUserApiReadCache: mocks.invalidate }))
vi.mock('@/services/analytics-service', () => ({ clearUserAnalyticsFallback: mocks.clear }))
import { processAccountDeletion, requestAccountDeletion, recoverAccountDeletions } from '@/services/account-deletion-service'

let intent: AccountDeletion | null
beforeEach(() => {
  vi.resetAllMocks()
  intent = null
  mocks.db.accountDeletion.findUnique.mockImplementation(async () => intent ? { ...intent } : null)
  mocks.db.accountDeletion.create.mockImplementation(async ({ data }) => {
    intent = { ...data, status: 'requested', requestedAt: new Date(), updatedAt: new Date(), completedAt: null, leaseToken: null, leaseExpiresAt: null, attempts: 0, lastErrorCode: null }
    return intent
  })
  mocks.db.accountDeletion.updateMany.mockImplementation(async ({ where, data }) => {
    if (!intent || intent.status === 'complete' || (where.leaseToken && where.leaseToken !== intent.leaseToken)) return { count: 0 }
    if (where.OR && intent.leaseExpiresAt && intent.leaseExpiresAt.getTime() > Date.now()) return { count: 0 }
    intent = { ...intent, ...data, attempts: data.attempts ? intent.attempts + 1 : intent.attempts }
    return { count: 1 }
  })
  mocks.db.accountDeletion.update.mockImplementation(async ({ data }) => { intent = { ...intent!, ...data }; return intent })
  mocks.db.user.findUnique.mockResolvedValue({ id: 'user-1' })
  mocks.db.subscription.findUnique.mockResolvedValue(null)
  mocks.db.user.update.mockResolvedValue({ id: 'user-1', deletionRequestedAt: new Date() })
  mocks.db.user.deleteMany.mockResolvedValue({ count: 1 })
  mocks.db.analytics.deleteMany.mockResolvedValue({ count: 1 })
  mocks.checkoutList.mockResolvedValue({ data: [], has_more: false })
  mocks.subscriptionsList.mockResolvedValue({ data: [], has_more: false })
})

async function request(paid = false) {
  if (paid) mocks.db.subscription.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' })
  return requestAccountDeletion('user-1')
}

describe('durable account deletion', () => {
  it('persists intent and blocks new work before deleting a free account; repeats are no-ops', async () => {
    await request()
    expect(mocks.db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deletionRequestedAt: intent!.requestedAt } }))
    expect((await processAccountDeletion('user-1')).status).toBe('complete')
    expect(mocks.configured).not.toHaveBeenCalled()
    expect(mocks.db.user.deleteMany).toHaveBeenCalledOnce()
    expect(mocks.invalidate).toHaveBeenCalledWith('user-1')
    expect(mocks.clear).toHaveBeenCalledWith('user-1')
    expect((await processAccountDeletion('user-1')).status).toBe('complete')
    expect(mocks.db.user.deleteMany).toHaveBeenCalledOnce()
  })
  it('expires open checkout and cancels all renewing subscriptions before removing the billing mapping', async () => {
    await request(true)
    mocks.checkoutList.mockResolvedValue({ data: [{ id: 'cs_open' }], has_more: false })
    mocks.subscriptionsList.mockResolvedValue({ data: [{ id: 'sub_active', status: 'active' }, { id: 'sub_past_due', status: 'past_due' }, { id: 'sub_done', status: 'canceled' }], has_more: false })
    expect((await processAccountDeletion('user-1')).status).toBe('complete')
    expect(mocks.checkoutExpire).toHaveBeenCalledWith('cs_open', {}, expect.objectContaining({ idempotencyKey: 'delete-checkout:user-1:cs_open' }))
    expect(mocks.cancel).toHaveBeenCalledTimes(2)
    expect(mocks.cancel).toHaveBeenCalledWith('sub_active', { invoice_now: false, prorate: false }, expect.objectContaining({ idempotencyKey: 'delete-subscription:user-1:sub_active' }))
    expect(mocks.cancel.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.db.user.deleteMany.mock.invocationCallOrder[0])
  })
  it('preserves customer mapping and active data after Stripe failure, then succeeds on retry', async () => {
    await request(true)
    mocks.subscriptionsList.mockResolvedValue({ data: [{ id: 'sub_active', status: 'active' }], has_more: false })
    mocks.cancel.mockRejectedValueOnce(new Error('private provider message must not escape'))
    await expect(processAccountDeletion('user-1')).rejects.toMatchObject({ code: 'DELETION_RETRY_REQUIRED' })
    expect(intent).toMatchObject({ status: 'requested', stripeCustomerId: 'cus_1', leaseToken: null, lastErrorCode: 'DELETION_RETRY_REQUIRED' })
    expect(mocks.db.user.deleteMany).not.toHaveBeenCalled()
    mocks.cancel.mockResolvedValue({ status: 'canceled' })
    expect((await processAccountDeletion('user-1')).status).toBe('complete')
    expect(mocks.cancel.mock.calls[0][2].idempotencyKey).toBe(mocks.cancel.mock.calls[1][2].idempotencyKey)
  })
  it('preserves durable billing progress after DB failure and rechecks billing before retrying purge', async () => {
    await request(true)
    mocks.db.analytics.deleteMany.mockRejectedValueOnce(new Error('DB unavailable'))
    await expect(processAccountDeletion('user-1')).rejects.toMatchObject({ code: 'DELETION_RETRY_REQUIRED' })
    expect(intent).toMatchObject({ status: 'billing_stopped', completedAt: null, leaseToken: null })
    expect(mocks.db.user.deleteMany).not.toHaveBeenCalled()
    expect((await processAccountDeletion('user-1')).status).toBe('complete')
    expect(mocks.subscriptionsList).toHaveBeenCalledTimes(2)
  })
  it('lets only one worker claim an unexpired lease', async () => {
    await request(true)
    intent!.leaseToken = 'other-worker'
    intent!.leaseExpiresAt = new Date(Date.now() + 60_000)
    expect((await processAccountDeletion('user-1')).status).toBe('requested')
    expect(mocks.subscriptionsList).not.toHaveBeenCalled()
    expect(mocks.db.user.deleteMany).not.toHaveBeenCalled()
  })
  it('keeps an existing intent stable across duplicate requests', async () => {
    const first = await request(true)
    expect(await requestAccountDeletion('user-1')).toEqual(first)
    expect(mocks.db.accountDeletion.create).toHaveBeenCalledOnce()
  })
})

it('recovers pending intent and prunes only expired completed reconciliation records', async () => {
  await request()
  mocks.db.accountDeletion.findFirst.mockResolvedValueOnce(intent).mockResolvedValueOnce(null)
  const result = await recoverAccountDeletions()
  expect(result).toEqual({ recovered: 1, more: false })
  const pruning = mocks.db.accountDeletion.deleteMany.mock.calls[0][0].where
  expect(pruning.status).toBe('complete')
  expect(pruning.completedAt.lt.getTime()).toBeGreaterThan(Date.now() - 90 * 86_400_000 - 1000)
  expect(mocks.db.stripeWebhookEvent.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: pruning.completedAt.lt } } })
})
