import { NextResponse } from 'next/server'
import { readApiObject } from '@/lib/api-input'
import { checkAndConsume } from '@/lib/rate-limit'
import { consumePasswordResetToken, INVALID_RESET_MESSAGE, PasswordResetError } from '@/lib/password-reset'
import { logger } from '@/lib/logger'

const noStore = { 'Cache-Control': 'no-store' }
const WINDOW_MS = 15 * 60 * 1000

const clientAddress = (request: Request) =>
  (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? '')
    .split(',')[0]
    .trim()
    .slice(0, 64) || 'unknown'

/** Consumes a support-issued password reset token. Never reveals account state. */
export async function POST(request: Request) {
  try {
    const perAddress = await checkAndConsume(`auth:password-reset:ip:${clientAddress(request)}`, { max: 10, windowMs: WINDOW_MS })
    const overall = perAddress.allowed
      ? await checkAndConsume('auth:password-reset:global', { max: 200, windowMs: WINDOW_MS })
      : perAddress
    if (!overall.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait and try again.' },
        { status: 429, headers: { ...noStore, 'Retry-After': String(WINDOW_MS / 1000) } },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Request protection is temporarily unavailable. Try again shortly.' },
      { status: 503, headers: { ...noStore, 'Retry-After': '5' } },
    )
  }

  const body = await readApiObject(request)
  if (body instanceof NextResponse) return body

  try {
    await consumePasswordResetToken(body.token, body.password)
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return NextResponse.json(
        { error: error.kind === 'weak-password' ? error.message : INVALID_RESET_MESSAGE },
        { status: 400, headers: noStore },
      )
    }
    logger.warn('password_reset_failed', { error: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Unable to reset the password. Please retry.' }, { status: 503, headers: noStore })
  }
}
