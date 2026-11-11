import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getLlmQuota } from '@/lib/llm-quota'
import { logger } from '@/lib/logger'
import prisma from '@/lib/prisma'
import { isStripeCheckoutConfigured } from '@/lib/stripe'
import { PAYMENT_ATTENTION_STATUSES, type UsageSnapshot } from '@/lib/usage-notice'

const noStore = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/account/usage
 * The signed-in account's plan, monthly allowance and payment state. Read-only:
 * it never reserves or consumes allowance.
 */
export async function GET() {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth

  try {
    const [quota, subscription] = await Promise.all([
      getLlmQuota(auth.user.id),
      prisma.subscription.findUnique({
        where: { userId: auth.user.id },
        select: { stripeStatus: true, stripeSubscriptionId: true },
      }),
    ])

    const limited = quota && quota.limit !== null
    const tier = quota?.tier ?? 'FREE'
    const snapshot: UsageSnapshot = {
      tier,
      quota: limited
        ? {
            limit: quota.limit as number,
            used: quota.used,
            remaining: Math.max(0, (quota.limit as number) - quota.used),
            resetsAt: quota.resetsAt,
          }
        : null,
      paymentNeedsAttention:
        Boolean(subscription?.stripeSubscriptionId) &&
        (PAYMENT_ATTENTION_STATUSES as readonly string[]).includes(
          subscription?.stripeStatus ?? '',
        ),
      canUpgrade: tier === 'FREE' && isStripeCheckoutConfigured,
    }
    return NextResponse.json(snapshot, { headers: noStore })
  } catch {
    logger.warn('account_usage_unavailable', { route: '/api/account/usage', userId: auth.user.id })
    return NextResponse.json(
      { error: 'Plan usage is temporarily unavailable.' },
      { status: 503, headers: noStore },
    )
  }
}
