import { NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { authIdentity } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { hasRecentOAuthProof } from '@/lib/deletion-proof'
import { checkAndConsume } from '@/lib/rate-limit'
import { LlmRequestError, readBoundedJson } from '@/lib/llm-request'
import { AccountDeletionError, deletionProgress, processAccountDeletion, requestAccountDeletion } from '@/services/account-deletion-service'

export const maxDuration = 60
const bodySchema = z.object({
  userId: z.string().min(1).max(200),
  confirmation: z.literal('DELETE MY ACCOUNT'),
  password: z.string().min(1).max(128).optional(),
}).strict()

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET() {
  const authCheck = await getAuthenticatedUser({ allowAccountDeletion: true })
  if (authCheck instanceof NextResponse) return authCheck
  const userId = authCheck.user.id
  try {
    const [record, accounts, intent, identity] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
      prisma.account.findMany({ where: { userId }, select: { provider: true } }),
      prisma.accountDeletion.findUnique({ where: { userId } }),
      authIdentity(),
    ])
    const providers = accounts.map(account => account.provider).filter(provider => ['google', 'github'].includes(provider))
    return json({ userId, email: authCheck.user.email, hasPassword: Boolean(record?.password), providers,
      recentOAuth: identity?.user.id === userId && hasRecentOAuthProof(identity.user, providers),
      progress: intent ? deletionProgress(intent) : null,
    })
  } catch { return json({ error: 'Account deletion is temporarily unavailable.' }, 503) }
}

export async function POST(request: Request) {
  const authCheck = await getAuthenticatedUser({ allowAccountDeletion: true })
  if (authCheck instanceof NextResponse) return authCheck
  const userId = authCheck.user.id
  try {
    const limit = await checkAndConsume(`account-deletion:${userId}`, { max: 5, windowMs: 15 * 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Too many deletion attempts. Retry shortly.' }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))), 'Cache-Control': 'no-store' } })
    const parsed = bodySchema.safeParse(await readBoundedJson(request, 4096))
    if (!parsed.success) return json({ error: 'Confirm the account and type DELETE MY ACCOUNT.' }, 400)
    if (parsed.data.userId !== userId) return json({ error: 'The signed-in account changed. Review the account before confirming.' }, 409)
    const intent = await prisma.accountDeletion.findUnique({ where: { userId } })
    if (!intent) {
      const [record, accounts, identity] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
        prisma.account.findMany({ where: { userId }, select: { provider: true } }),
        authIdentity(),
      ])
      if (!record) return json({ error: 'Unauthorized' }, 401)
      const passwordProof = Boolean(record.password && parsed.data.password && await compare(parsed.data.password, record.password))
      const oauthProof = identity?.user.id === userId && hasRecentOAuthProof(identity.user, accounts.map(account => account.provider))
      if (!passwordProof && !oauthProof) return json({ error: 'Verify your identity again before deleting your account.', code: 'REAUTH_REQUIRED' }, 403)
      await requestAccountDeletion(userId)
    }
    const progress = await processAccountDeletion(userId)
    return json(progress, progress.status === 'complete' ? 200 : 202)
  } catch (error) {
    if (error instanceof LlmRequestError) return json({ error: error.message, code: error.code }, error.status)
    if (error instanceof AccountDeletionError) return json({ error: 'Deletion is incomplete. Your request is saved; retry shortly.', code: error.code }, error.status)
    return json({ error: 'Deletion could not be completed. Retry shortly.' }, 503)
  }
}
