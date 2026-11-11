import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findSubscription: vi.fn(),
  deleteAnalytics: vi.fn(),
  deleteUser: vi.fn(),
  transaction: vi.fn(),
  list: vi.fn(),
  cancel: vi.fn(),
  stripeConfigured: { value: true },
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    subscription: { findUnique: mocks.findSubscription },
    $transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/stripe', () => ({
  get isStripeApiConfigured() {
    return mocks.stripeConfigured.value
  },
  stripe: { subscriptions: { list: mocks.list, cancel: mocks.cancel } },
}))

import { AccountDeletionError, deleteAccount } from '@/services/account-deletion-service'

const order: string[] = []

beforeEach(() => {
  vi.resetAllMocks()
  order.length = 0
  mocks.stripeConfigured.value = true
  mocks.findSubscription.mockResolvedValue(null)
  mocks.deleteAnalytics.mockImplementation(async () => {
    order.push('analytics')
    return { count: 3 }
  })
  mocks.deleteUser.mockImplementation(async () => {
    order.push('user')
    return { id: 'owner' }
  })
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) =>
    work({
      analytics: { deleteMany: mocks.deleteAnalytics },
      user: { delete: mocks.deleteUser },
    }),
  )
  mocks.cancel.mockImplementation(async (id: string) => {
    order.push(`cancel:${id}`)
    return { id, status: 'canceled' }
  })
})

describe('deleteAccount', () => {
  it('removes analytics and the user in one transaction for an account without billing', async () => {
    await expect(deleteAccount('owner')).resolves.toEqual({ cancelledSubscriptions: 0 })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.deleteAnalytics).toHaveBeenCalledWith({ where: { userId: 'owner' } })
    expect(mocks.deleteUser).toHaveBeenCalledWith({ where: { id: 'owner' } })
    expect(order).toEqual(['analytics', 'user'])
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('cancels every billable Stripe subscription before deleting data', async () => {
    mocks.findSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_a', stripeStatus: 'active' })
    mocks.list.mockResolvedValue({
      data: [
        { id: 'sub_a', status: 'active' },
        { id: 'sub_b', status: 'past_due' },
        { id: 'sub_old', status: 'canceled' },
        { id: 'sub_expired', status: 'incomplete_expired' },
      ],
    })
    await expect(deleteAccount('owner')).resolves.toEqual({ cancelledSubscriptions: 2 })
    expect(mocks.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 100 })
    expect(order).toEqual(['cancel:sub_a', 'cancel:sub_b', 'analytics', 'user'])
  })

  it('keeps the account when Stripe cancellation fails', async () => {
    mocks.findSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_a', stripeStatus: 'active' })
    mocks.list.mockResolvedValue({ data: [{ id: 'sub_a', status: 'active' }] })
    mocks.cancel.mockRejectedValue(new Error('stripe network failure'))
    await expect(deleteAccount('owner')).rejects.toMatchObject({ code: 'BILLING_CANCEL_FAILED' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('keeps the account when listing subscriptions fails', async () => {
    mocks.findSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1' })
    mocks.list.mockRejectedValue(new Error('stripe unavailable'))
    await expect(deleteAccount('owner')).rejects.toBeInstanceOf(AccountDeletionError)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('continues when Stripe says a subscription or the customer is already gone', async () => {
    mocks.findSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_a', stripeStatus: 'active' })
    mocks.list.mockResolvedValue({ data: [{ id: 'sub_a', status: 'active' }] })
    mocks.cancel.mockRejectedValue(Object.assign(new Error('No such subscription'), { code: 'resource_missing' }))
    await expect(deleteAccount('owner')).resolves.toEqual({ cancelledSubscriptions: 0 })
    expect(order).toEqual(['analytics', 'user'])

    order.length = 0
    mocks.list.mockRejectedValue(Object.assign(new Error('No such customer'), { code: 'resource_missing' }))
    await expect(deleteAccount('owner')).resolves.toEqual({ cancelledSubscriptions: 0 })
    expect(order).toEqual(['analytics', 'user'])
  })

  it('refuses to delete a possibly billed account when Stripe is not configured', async () => {
    mocks.stripeConfigured.value = false
    mocks.findSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_a', stripeStatus: 'active' })
    await expect(deleteAccount('owner')).rejects.toMatchObject({ code: 'BILLING_UNAVAILABLE' })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('deletes a never-subscribed customer record when Stripe is not configured', async () => {
    mocks.stripeConfigured.value = false
    mocks.findSubscription.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: null, stripeStatus: null })
    await expect(deleteAccount('owner')).resolves.toEqual({ cancelledSubscriptions: 0 })
    expect(order).toEqual(['analytics', 'user'])
  })

  it('does not report success when the database transaction fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('database unavailable'))
    await expect(deleteAccount('owner')).rejects.toThrow('database unavailable')
  })
})
