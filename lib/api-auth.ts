import { NextResponse } from 'next/server'
import { authIdentity } from '@/lib/auth'
import { resolveAuthTeamRole } from '@/lib/auth-roles'
import prisma from '@/lib/prisma'
import type { User } from '@/types/prisma'

type RoleAwareUser = User & {
  role?: string | null
}

let sessionErrorLogged = false

const isJwtDecryptionError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const name = error.name.toLowerCase()
  const message = error.message.toLowerCase()
  return (
    name.includes('jwt') ||
    name.includes('jwe') ||
    message.includes('jwt') ||
    message.includes('decrypt') ||
    message.includes('jwe') ||
    message.includes('invalid compact jwe') ||
    message.includes('decryption operation failed')
  )
}

/**
 * Resolve the current authenticated user for a protected API route.
 * Guest and demo identities are intentionally unsupported.
 *
 * Order of checks (each one fails closed):
 *   1. Decode the session cookie without a database round-trip (authIdentity).
 *   2. Re-read the account; a deleted account is rejected.
 *   3. Compare the token's password version with the account's; a session
 *      minted before a password change is rejected.
 *   4. Derive the role from this fresh read only: the persisted User.role
 *      column combined with the environment allowlists.
 *
 * Authorization policy (P3): this fresh database read is the only source of
 * authorization. The role and email claims inside the JWT are never trusted.
 * Known display gap: lib/auth.ts still derives session.user.role from the
 * allowlists alone, so a session can display MEMBER for an account whose
 * persisted role is ADMIN or OWNER. The current source review found no
 * authorization consumer of session.user.role. The session-role-consumers
 * test is a heuristic regression guard; future authorization changes require
 * explicit review. Role-based UI must call an API using this function.
 */
export async function getAuthenticatedUser(): Promise<
  { user: User } | NextResponse
> {
  try {
    // Identity only: the account is re-read below and the tier is not needed here.
    const session = await authIdentity()
    if (session?.user?.id) {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          passwordVersion: true,
          role: true,
        },
      })
      // JWTs outlive deleted accounts and changes to the admin allowlist.
      // Every protected operation must use the current account identity.
      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      // Password changes bump passwordVersion; sessions minted before the change are revoked.
      const sessionPasswordVersion =
        typeof session.user.pv === 'number' ? session.user.pv : 0
      if (sessionPasswordVersion !== (currentUser.passwordVersion ?? 0)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      sessionErrorLogged = false
      return {
        user: {
          ...currentUser,
          role: resolveAuthTeamRole(currentUser.email, currentUser.role),
        } as unknown as User,
      }
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } catch (error) {
    if (isJwtDecryptionError(error)) {
      if (!sessionErrorLogged) {
        sessionErrorLogged = true
        console.warn(
          'Session token could not be decrypted. Treating the request as unauthenticated.',
        )
      }

      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    if (!sessionErrorLogged) {
      sessionErrorLogged = true
      console.error('Failed to validate authenticated account')
    }

    return NextResponse.json({ error: 'Auth unavailable' }, { status: 503 })
  }
}

export async function getAuthenticatedAdmin(): Promise<
  { user: RoleAwareUser } | NextResponse
> {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) {
    return authCheck
  }

  const user = authCheck.user as RoleAwareUser
  if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { user }
}
