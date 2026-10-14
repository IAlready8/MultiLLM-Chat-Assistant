import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { readApiObject } from '@/lib/api-input'
import { checkAndConsume } from '@/lib/rate-limit'
import prisma from '@/lib/prisma'

const schema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict()

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth

  const rate = await checkAndConsume(`auth:change-password:${auth.user.id}`, {
    windowMs: 15 * 60 * 1000,
    max: 10,
  })
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
      { error: 'Provide your current password and a new password of 8–128 characters.' },
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
    await prisma.user.update({ where: { id: auth.user.id }, data: { password: hash } })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { error: 'Unable to change your password. Please retry.' },
      { status: 503 }
    )
  }
}
