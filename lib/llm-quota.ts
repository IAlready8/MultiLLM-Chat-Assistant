import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { LlmRequestError } from '@/lib/llm-request'
import type { PrismaClient, Subscription } from '@/types/prisma'

const limitsSchema = z.object({ FREE: z.number().int().min(0).max(1_000_000_000).nullable(), PRO: z.number().int().min(0).max(1_000_000_000).nullable(), ENTERPRISE: z.number().int().min(0).max(1_000_000_000).nullable() }).strict()

export function readQuotaLimits() {
  const raw = process.env.LLM_MONTHLY_REQUEST_LIMITS?.trim()
  if (!raw) return null
  try { return limitsSchema.parse(JSON.parse(raw)) } catch {
    throw new LlmRequestError('Plan limits are temporarily unavailable', 503, 'QUOTA_CONFIGURATION_INVALID')
  }
}

function quotaTier(subscription: Subscription | null, now: Date): 'FREE' | 'PRO' | 'ENTERPRISE' {
  if (subscription?.tier === 'ENTERPRISE') return 'ENTERPRISE'
  if (subscription?.tier === 'PRO' && subscription.stripePriceId === process.env.STRIPE_PRO_PRICE_ID?.trim() && subscription.stripePriceId && ['active', 'trialing'].includes(subscription.stripeStatus ?? '') && subscription.stripeCurrentPeriodEnd && new Date(subscription.stripeCurrentPeriodEnd) > now) return 'PRO'
  return 'FREE'
}

async function readUsage(tx: PrismaClient, userId: string, start: Date) {
  const rows = await tx.$queryRaw`SELECT COALESCE(SUM("units"), 0)::text AS used FROM "LlmQuotaUsage" WHERE "userId" = ${userId} AND "createdAt" >= ${start}` as Array<{ used: string }>
  return Number(rows[0]?.used ?? 0)
}

function period(now: Date) {
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), reset: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) }
}

export async function getLlmQuota(userId: string) {
  const limits = readQuotaLimits()
  if (!limits) return null
  const now = new Date()
  const { start, reset } = period(now)
  const [subscription, used] = await Promise.all([prisma.subscription.findUnique({ where: { userId } }), readUsage(prisma, userId, start)])
  const tier = quotaTier(subscription, now)
  return { tier, limit: limits[tier], used, resetsAt: reset.toISOString() }
}

/** One unit is one attempted provider generation, including failed/canceled calls.
 * Reserve immediately before dispatch. Saved replay never reaches this method.
 * Deleting a conversation cannot refund usage. No automatic paid retries.
 */
export async function reserveLlmQuota(userId: string, units = 1) {
  const limits = readQuotaLimits()
  if (!limits) return
  if (!Number.isInteger(units) || units < 1 || units > 8) throw new LlmRequestError('Invalid generation count')
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${'llm-quota:' + userId}, 0))`
    const now = new Date()
    const { start, reset } = period(now)
    const subscription = await tx.subscription.findUnique({ where: { userId } })
    const limit = limits[quotaTier(subscription, now)]
    const used = await readUsage(tx, userId, start)
    if (limit !== null && used + units > limit) {
      throw new LlmRequestError('Monthly generation allowance reached. Review your plan in Billing.', 429, 'QUOTA_EXCEEDED', Math.ceil((reset.getTime() - now.getTime()) / 1000))
    }
    await tx.llmQuotaUsage.create({ data: { id: randomUUID(), userId, units, createdAt: now } })
  })
}
