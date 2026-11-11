/**
 * Decides whether a signed-in user should see a plan notice, and which one.
 * Pure so the server route and the banner agree and both are easy to test.
 */

export type UsageSnapshot = {
  tier: 'FREE' | 'PRO' | 'ENTERPRISE'
  /** null when no monthly allowance is enforced for this account. */
  quota: { limit: number; used: number; remaining: number; resetsAt: string } | null
  /** A paid subscription whose latest payment did not go through. */
  paymentNeedsAttention: boolean
  /** True when this account could buy a larger allowance right now. */
  canUpgrade: boolean
}

export type UsageNotice =
  | { kind: 'payment' }
  | { kind: 'exhausted'; limit: number; resetsAt: string; canUpgrade: boolean }
  | { kind: 'low'; used: number; limit: number; remaining: number; canUpgrade: boolean }

/** Share of the allowance at which the notice starts to show. */
export const LOW_ALLOWANCE_THRESHOLD = 0.8

export const PAYMENT_ATTENTION_STATUSES = ['past_due', 'unpaid', 'incomplete', 'paused'] as const

export const selectUsageNotice = (snapshot: UsageSnapshot | null): UsageNotice | null => {
  if (!snapshot) return null
  // A failed payment outranks usage: it is what will cost them their plan.
  if (snapshot.paymentNeedsAttention) return { kind: 'payment' }

  const quota = snapshot.quota
  if (!quota) return null

  if (quota.used >= quota.limit) {
    return {
      kind: 'exhausted',
      limit: quota.limit,
      resetsAt: quota.resetsAt,
      canUpgrade: snapshot.canUpgrade,
    }
  }
  if (quota.limit > 0 && quota.used / quota.limit >= LOW_ALLOWANCE_THRESHOLD) {
    return {
      kind: 'low',
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
      canUpgrade: snapshot.canUpgrade,
    }
  }
  return null
}
