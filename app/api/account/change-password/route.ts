import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { readApiObject } from '@/lib/api-input'
import { checkAndConsume } from '@/lib/rate-limit'
import prisma from '@/lib/prisma'

// bcrypt only uses the first 72 bytes of a password; longer inputs would be
// silently truncated, so the length is capped up front.
const MAX_PASSWORD_BYTES = 72

const newPasswordSchema = z
  .string()
  .min(8)
  .max(MAX_PASSWORD_BYTES)
  .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, {
    message: 'Use at least 8 characters and at most 72 UTF-8 bytes.',
  })

const schema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordSchema,
  })
  .strict()

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth

  let rate: { allowed: boolean }
  try {
    rate = await checkAndConsume(`auth:change-password:${auth.user.id}`, {
      windowMs: 15 * 60 * 1000,
      max: 10,
    })
  } catch {
    return NextResponse.json(
      { error: 'Request protection is temporarily unavailable. Try again shortly.' },
      { status: 503 }
    )
  }
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  const body = await readApiObject(request)
  if (body instanceof NextResponse) return body
  const input = schema.safeParse(body)
  if (!input.success) {
    return NextResponse.json(
      { error: 'Provide your current password and a new password of at least 8 characters and at most 72 UTF-8 bytes.' },
      { status: 400 }
    )
  }

  const { currentPassword, newPassword } = input.data
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'The new password must be different from the current password.' },
      { status: 400 }
    )
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { password: true },
    })
    if (!user?.password) {
      return NextResponse.json(
        { error: 'Your account does not use a password to sign in.' },
        { status: 400 }
      )
    }

    const matches = await bcrypt.compare(currentPassword, user.password)
    if (!matches) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    // Bumping passwordVersion revokes every existing session, including this
    // one: the user signs in again with the new password.
    const changed = await prisma.user.updateMany({
      // Do not let an overlapping request replace a password changed since
      // this request verified the old hash.
      where: { id: auth.user.id, password: user.password },
      data: { password: hash, passwordVersion: { increment: 1 } },
    })
    if (changed.count !== 1) {
      return NextResponse.json(
        { error: 'Your password changed during this request. Sign in again and retry.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { error: 'Unable to change your password. Please retry.' },
      { status: 503 }
    )
  }
}
