import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { readApiObject } from '@/lib/api-input'
import { checkAndConsume } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import prisma from '@/lib/prisma'
import {
  AccountDeletionError,
  deleteAccount,
} from '@/services/account-deletion-service'

export const maxDuration = 30

const schema = z
  .object({
    confirmEmail: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128).optional(),
  })
  .strict()

const noStore = { 'Cache-Control': 'no-store' }

/**
 * DELETE /api/account
 * Permanently deletes the signed-in account and everything it owns.
 * Requires the account email typed back as confirmation, plus the current
 * password for accounts that have one.
 */
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth

  let rate: { allowed: boolean }
  try {
    rate = await checkAndConsume(`account-delete:${auth.user.id}`, {
      windowMs: 15 * 60 * 1000,
      max: 5,
    })
  } catch {
    return NextResponse.json(
      { error: 'Request protection is temporarily unavailable. Try again shortly.' },
      { status: 503, headers: noStore },
    )
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: noStore },
    )
  }

  const body = await readApiObject(request)
  if (body instanceof NextResponse) return body
  const input = schema.safeParse(body)
  if (!input.success) {
    return NextResponse.json(
      { error: 'Type your account email to confirm deletion.' },
      { status: 400, headers: noStore },
    )
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { email: true, password: true },
    })
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
    }

    const expected = (account.email ?? '').trim().toLowerCase()
    if (!expected || input.data.confirmEmail.toLowerCase() !== expected) {
      return NextResponse.json(
        { error: 'The email you typed does not match this account.' },
        { status: 400, headers: noStore },
      )
    }

    if (account.password) {
      if (!input.data.password) {
        return NextResponse.json(
          {
            error: 'Enter your current password to delete this account.',
            code: 'PASSWORD_REQUIRED',
          },
          { status: 400, headers: noStore },
        )
      }
      const matches = await bcrypt.compare(input.data.password, account.password)
      if (!matches) {
        return NextResponse.json(
          { error: 'Current password is incorrect.', code: 'PASSWORD_REQUIRED' },
          { status: 401, headers: noStore },
        )
      }
    }

    const result = await deleteAccount(auth.user.id)
    logger.info('account_deleted', {
      route: '/api/account',
      userId: auth.user.id,
      cancelledSubscriptions: result.cancelledSubscriptions,
    })
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      logger.warn('account_delete_billing_blocked', {
        route: '/api/account',
        userId: auth.user.id,
        reason: error.code,
      })
      return NextResponse.json(
        {
          error:
            'Your subscription could not be cancelled, so your account was not deleted. Cancel it from Billing or retry shortly.',
          code: error.code,
        },
        { status: 503, headers: noStore },
      )
    }
    logger.error('account_delete_failed', { route: '/api/account', userId: auth.user.id })
    return NextResponse.json(
      { error: 'Unable to delete your account. Nothing was removed. Please retry.' },
      { status: 503, headers: noStore },
    )
  }
}
