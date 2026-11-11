import prisma from '@/lib/prisma'
import { isStripeApiConfigured, stripe } from '@/lib/stripe'

/**
 * Permanent, self-serve account deletion.
 *
 * Order matters and is deliberate:
 *   1. Stop billing first. If a paid subscription cannot be cancelled, the
 *      account is NOT deleted, so nobody is charged for an account they can no
 *      longer sign in to.
 *   2. Remove application data in one transaction. Every user-owned model
 *      cascades from User except Analytics, which has no relation and is
 *      purged explicitly.
 *
 * The Stripe customer object is intentionally kept: invoices and payment
 * records are financial records with their own retention rules. This is stated
 * in the privacy policy.
 */

export type AccountDeletionFailure = 'BILLING_UNAVAILABLE' | 'BILLING_CANCEL_FAILED'

export class AccountDeletionError extends Error {
  constructor(public readonly code: AccountDeletionFailure) {
    super(code)
    this.name = 'AccountDeletionError'
  }
}

// Statuses in which Stripe can still attempt to collect payment.
const BILLABLE_STATUSES = new Set([
  'active',
  'incomplete',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
])

const isMissingStripeResource = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'resource_missing',
  )

async function cancelBilling(subscription: {
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripeStatus?: string | null
}): Promise<number> {
  const customerId = subscription.stripeCustomerId
  if (!customerId) return 0

  if (!isStripeApiConfigured) {
    const mayStillBill =
      Boolean(subscription.stripeSubscriptionId) &&
      BILLABLE_STATUSES.has(subscription.stripeStatus ?? '')
    if (mayStillBill) throw new AccountDeletionError('BILLING_UNAVAILABLE')
    return 0
  }

  try {
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })
    let cancelled = 0
    for (const item of existing.data) {
      if (!BILLABLE_STATUSES.has(item.status)) continue
      try {
        await stripe.subscriptions.cancel(item.id)
        cancelled += 1
      } catch (error) {
        // Already gone on Stripe's side: nothing left to bill.
        if (!isMissingStripeResource(error)) throw error
      }
    }
    return cancelled
  } catch (error) {
    // The customer no longer exists in Stripe, so nothing can be billed.
    if (isMissingStripeResource(error)) return 0
    throw new AccountDeletionError('BILLING_CANCEL_FAILED')
  }
}

export async function deleteAccount(
  userId: string,
): Promise<{ cancelledSubscriptions: number }> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeStatus: true,
    },
  })

  const cancelledSubscriptions = subscription
    ? await cancelBilling(subscription)
    : 0

  await prisma.$transaction(async (tx) => {
    await tx.analytics.deleteMany({ where: { userId } })
    await tx.user.delete({ where: { id: userId } })
  })

  return { cancelledSubscriptions }
}
