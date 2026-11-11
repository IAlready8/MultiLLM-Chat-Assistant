import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getLlmQuota } from '@/lib/llm-quota'
import { logger } from '@/lib/logger'
import prisma from '@/lib/prisma'
import { enforceRouteLimit } from '@/lib/route-rate-limit'

export const maxDuration = 30

const noStore = { 'Cache-Control': 'private, no-store' }

// Generous for a personal workspace, and a hard stop on response size.
const MAX_ROWS = 5000

const iso = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null

/**
 * GET /api/account/data
 * A machine-readable copy of the caller's own account data: profile, personas,
 * goals, connected providers, plan and usage. Conversations are exported
 * separately as an encrypted archive (POST /api/account/export).
 *
 * Deliberately excluded: API keys (encrypted or not), provider settings blobs,
 * password hashes, session tokens and Stripe identifiers.
 */
export async function GET() {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  const userId = auth.user.id

  const limited = await enforceRouteLimit({
    scope: 'account-data-export',
    userId,
    max: 10,
    windowMs: 15 * 60 * 1000,
    onUnavailable: 'deny',
  })
  if (limited) return limited

  try {
    const [user, personas, goals, providers, subscription, conversationCount, quota] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, image: true, emailVerified: true },
        }),
        prisma.persona.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          take: MAX_ROWS,
          select: { id: true, title: true, description: true, prompt: true, createdAt: true, updatedAt: true },
        }),
        prisma.goal.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          take: MAX_ROWS,
          select: { id: true, title: true, description: true, status: true, createdAt: true, updatedAt: true },
        }),
        prisma.providerConfig.findMany({
          where: { userId },
          orderBy: { provider: 'asc' },
          take: MAX_ROWS,
          // apiKey is selected only to derive a boolean; it never leaves this function.
          select: { provider: true, isActive: true, apiKey: true, createdAt: true, updatedAt: true },
        }),
        prisma.subscription.findUnique({
          where: { userId },
          select: {
            tier: true,
            stripeStatus: true,
            stripeCurrentPeriodEnd: true,
            stripeCancelAtPeriodEnd: true,
          },
        }),
        prisma.conversation.count({ where: { userId } }),
        getLlmQuota(userId).catch(() => null),
      ])

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
    }

    const body = {
      format: 'account-data',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        emailVerifiedAt: iso(user.emailVerified),
      },
      plan: {
        tier: subscription?.tier ?? 'FREE',
        status: subscription?.stripeStatus ?? null,
        currentPeriodEndsAt: iso(subscription?.stripeCurrentPeriodEnd),
        cancelsAtPeriodEnd: subscription?.stripeCancelAtPeriodEnd ?? false,
      },
      usage: quota
        ? { monthlyLimit: quota.limit, usedThisMonth: quota.used, resetsAt: quota.resetsAt }
        : null,
      personas: personas.map((persona) => ({
        id: persona.id,
        title: persona.title,
        description: persona.description ?? null,
        prompt: persona.prompt,
        createdAt: iso(persona.createdAt),
        updatedAt: iso(persona.updatedAt),
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description ?? null,
        status: goal.status,
        createdAt: iso(goal.createdAt),
        updatedAt: iso(goal.updatedAt),
      })),
      connectedProviders: providers.map((config) => ({
        provider: config.provider,
        isActive: config.isActive,
        hasSavedApiKey: Boolean(config.apiKey),
        createdAt: iso(config.createdAt),
        updatedAt: iso(config.updatedAt),
      })),
      conversations: {
        count: conversationCount,
        note: 'Conversation content is exported separately as an encrypted archive from Settings, Advanced.',
      },
    }

    const date = body.exportedAt.slice(0, 10)
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        ...noStore,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="account-data-${date}.json"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    logger.error('account_data_export_failed', { route: '/api/account/data', userId })
    return NextResponse.json(
      { error: 'Unable to prepare your account data. Please retry.' },
      { status: 503, headers: noStore },
    )
  }
}
