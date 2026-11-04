import type Stripe from 'stripe'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { withBillingLock } from '@/lib/billing-lock'
import { stripe, ensureStripeConfigured } from '@/lib/stripe'
import { invalidateUserApiReadCache } from '@/lib/api-read-cache'
import { clearUserAnalyticsFallback } from '@/services/analytics-service'
import type { AccountDeletion, PrismaClient } from '@/types/prisma'

const TERMINAL_SUBSCRIPTIONS = new Set(['canceled', 'incomplete_expired'])
const stripeOptions = { timeout: 5_000, maxNetworkRetries: 0 }

export class AccountDeletionError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code) }
}

export function deletionProgress(intent: AccountDeletion) {
  return {
    status: intent.status,
    requestedAt: intent.requestedAt.toISOString(),
    completedAt: intent.completedAt?.toISOString() ?? null,
    retryable: intent.status !== 'complete',
    error: intent.lastErrorCode ? 'Deletion is incomplete. Your request is saved; retry shortly.' : null,
  }
}

/** Use the same user lock as Checkout, so intent captures every customer mapping. */
export async function requestAccountDeletion(userId: string) {
  return withBillingLock(`billing-user:${userId}`, async tx => {
    const existing = await tx.accountDeletion.findUnique({ where: { userId } })
    if (existing) return existing
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
    const user = await tx.user.findUnique({ where: { id: userId } })
    if (!user) throw new AccountDeletionError('ACCOUNT_UNAVAILABLE', 401)
    const subscription = await tx.subscription.findUnique({ where: { userId } })
    const intent = await tx.accountDeletion.create({ data: {
      userId, stripeCustomerId: subscription?.stripeCustomerId ?? null,
    } })
    await tx.user.update({ where: { id: userId }, data: { deletionRequestedAt: intent.requestedAt } })
    return intent
  })
}

async function stopBilling(intent: AccountDeletion) {
  if (!intent.stripeCustomerId) return
  ensureStripeConfigured('api')
  const customer = intent.stripeCustomerId
  const deadline = Date.now() + 15_000
  const checkTime = () => {
    if (Date.now() > deadline) throw new AccountDeletionError('BILLING_RETRY_REQUIRED')
  }
  let cursor: string | undefined
  do {
    checkTime()
    const page = await stripe.checkout.sessions.list({ customer, status: 'open', limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, stripeOptions)
    for (const session of page.data) {
      checkTime()
      try {
        await stripe.checkout.sessions.expire(session.id, {}, { ...stripeOptions, idempotencyKey: `delete-checkout:${intent.userId}:${session.id}` })
      } catch (error) {
        // A checkout may finish while expiration is in flight. The subscription
        // pass below and signed-webhook tombstone handling stop that renewal.
        const current = await stripe.checkout.sessions.retrieve(session.id, {}, stripeOptions)
        if (current.status === 'open') throw error
      }
    }
    cursor = page.has_more ? page.data.at(-1)?.id : undefined
    if (page.has_more && !cursor) throw new AccountDeletionError('BILLING_RETRY_REQUIRED')
  } while (cursor)
  cursor = undefined
  do {
    checkTime()
    const page: Stripe.ApiList<Stripe.Subscription> = await stripe.subscriptions.list({ customer, status: 'all', limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, stripeOptions)
    for (const subscription of page.data) {
      if (TERMINAL_SUBSCRIPTIONS.has(subscription.status)) continue
      checkTime()
      await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }, {
        ...stripeOptions, idempotencyKey: `delete-subscription:${intent.userId}:${subscription.id}`,
      })
    }
    cursor = page.has_more ? page.data.at(-1)?.id : undefined
    if (page.has_more && !cursor) throw new AccountDeletionError('BILLING_RETRY_REQUIRED')
  } while (cursor)
}

async function purge(tx: PrismaClient, intent: AccountDeletion, leaseToken: string) {
  if (intent.stripeCustomerId) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`stripe-customer:${intent.stripeCustomerId}`}, 0))`
  }
  const current = await tx.accountDeletion.findUnique({ where: { userId: intent.userId } })
  if (current?.leaseToken !== leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= Date.now()) {
    throw new AccountDeletionError('DELETION_LEASE_EXPIRED')
  }
  // The Analytics FK also prevents an in-flight request from writing orphaned
  // events after this cascade. Explicit deletion covers pre-constraint rows.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${intent.userId} FOR UPDATE`
  await tx.analytics.deleteMany({ where: { userId: intent.userId } })
  await tx.user.deleteMany({ where: { id: intent.userId } })
  return tx.accountDeletion.update({ where: { userId: intent.userId }, data: {
    status: 'complete', completedAt: new Date(), leaseToken: null, leaseExpiresAt: null, lastErrorCode: null,
  } })
}

/** External actions are idempotent; intent survives every external or DB failure. */
export async function processAccountDeletion(userId: string) {
  const leaseToken = randomUUID()
  const now = new Date()
  const claimed = await prisma.accountDeletion.updateMany({ where: {
    userId, status: { not: 'complete' },
    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
  }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + 90_000), attempts: { increment: 1 }, lastErrorCode: null } })
  const intent = await prisma.accountDeletion.findUnique({ where: { userId } })
  if (!intent) throw new AccountDeletionError('DELETION_NOT_FOUND', 404)
  if (!claimed.count) return deletionProgress(intent)
  try {
    // Rechecking billing on every retry is deliberate: a checkout completed
    // before deletion can deliver its subscription after an earlier attempt.
    await stopBilling(intent)
    const saved = await prisma.accountDeletion.updateMany({ where: { userId, leaseToken }, data: { status: 'billing_stopped' } })
    if (!saved.count) throw new AccountDeletionError('DELETION_LEASE_EXPIRED')
    const complete = await withBillingLock(`billing-user:${userId}`, tx => purge(tx, intent, leaseToken))
    invalidateUserApiReadCache(userId)
    clearUserAnalyticsFallback(userId)
    return deletionProgress(complete)
  } catch {
    await prisma.accountDeletion.updateMany({ where: { userId, leaseToken }, data: {
      leaseToken: null, leaseExpiresAt: null, lastErrorCode: 'DELETION_RETRY_REQUIRED',
    } })
    throw new AccountDeletionError('DELETION_RETRY_REQUIRED')
  }
}

/** Called by the existing authenticated recovery job; one bounded account per run. */
export async function recoverAccountDeletions() {
  const next = await prisma.accountDeletion.findFirst({ where: {
    status: { not: 'complete' }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: new Date() } }],
  }, orderBy: { updatedAt: 'asc' } })
  let recovered = 0
  if (next) {
    try { recovered = (await processAccountDeletion(next.userId)).status === 'complete' ? 1 : 0 } catch { /* Durable intent remains retryable. */ }
  }
  const cutoff = new Date(Date.now() - 90 * 86_400_000)
  await prisma.accountDeletion.deleteMany({ where: { status: 'complete', completedAt: { lt: cutoff } } })
  await prisma.stripeWebhookEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
  const remaining = await prisma.accountDeletion.findFirst({ where: { status: { not: 'complete' } }, select: { userId: true } })
  return { recovered, more: Boolean(remaining) }
}
