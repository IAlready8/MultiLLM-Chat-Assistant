import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { newPasswordSchema } from '@/lib/password-policy'

/**
 * Support-assisted recovery for existing password accounts.
 *
 * There is no public "request a reset" endpoint, so nothing here reveals
 * whether an email has an account. The operator verifies the requester out of
 * band and issues a link with scripts/issue-password-reset.mjs. Only a SHA-256
 * hash of the 256-bit token is stored (VerificationToken), the token expires
 * after RECOVERY_TOKEN_TTL_MS, and it is consumed by an atomic delete so it
 * works once. A successful reset increments passwordVersion, which revokes
 * every session minted before it (lib/api-auth.ts, lib/auth.ts).
 */
export const RECOVERY_IDENTIFIER_PREFIX = 'password-reset:'
export const RECOVERY_TOKEN_TTL_MS = 60 * 60 * 1000
export const RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const INVALID_RESET_MESSAGE =
  'This reset link is invalid or has expired. Contact support for a new link.'

export class RecoveryTokenError extends Error {
  constructor(public readonly kind: 'invalid' | 'weak-password', message: string) {
    super(message)
    this.name = 'RecoveryTokenError'
  }
}

// The input is a 256-bit random token, not a user password: a single SHA-256
// is the appropriate storage hash for it (as NextAuth does for verification
// tokens). The user's new password is hashed with bcrypt below.
export const hashRecoveryToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex')

export async function consumeRecoveryToken(
  rawToken: unknown,
  rawPassword: unknown,
  now: Date = new Date(),
): Promise<void> {
  if (typeof rawToken !== 'string' || !RECOVERY_TOKEN_PATTERN.test(rawToken)) {
    throw new RecoveryTokenError('invalid', INVALID_RESET_MESSAGE)
  }
  const password = newPasswordSchema.safeParse(rawPassword)
  if (!password.success) {
    throw new RecoveryTokenError('weak-password', 'Use at least 8 characters and at most 72 UTF-8 bytes.')
  }

  const tokenHash = hashRecoveryToken(rawToken)
  // Hash before opening the transaction: bcrypt is deliberately slow.
  const passwordHash = await bcrypt.hash(password.data, 10)

  await prisma.$transaction(async (tx) => {
    const record = await tx.verificationToken.findUnique({ where: { token: tokenHash } })
    if (!record || !record.identifier.startsWith(RECOVERY_IDENTIFIER_PREFIX) || record.expires <= now) {
      throw new RecoveryTokenError('invalid', INVALID_RESET_MESSAGE)
    }
    // Single use: only the request that deletes the row may continue.
    const consumed = await tx.verificationToken.deleteMany({
      where: { token: tokenHash, identifier: record.identifier, expires: { gt: now } },
    })
    if (consumed.count !== 1) throw new RecoveryTokenError('invalid', INVALID_RESET_MESSAGE)

    const userId = record.identifier.slice(RECOVERY_IDENTIFIER_PREFIX.length)
    const updated = await tx.user.updateMany({
      where: { id: userId, password: { not: null }, deletionRequestedAt: null },
      data: { password: passwordHash, passwordVersion: { increment: 1 } },
    })
    if (updated.count !== 1) throw new RecoveryTokenError('invalid', INVALID_RESET_MESSAGE)

    await tx.verificationToken.deleteMany({ where: { identifier: record.identifier } })
  })
}
