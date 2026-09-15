import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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
 */
export async function getAuthenticatedUser(): Promise<
  { user: User } | NextResponse
> {
  try {
    const session = await auth()
    if (session?.user?.id) {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, image: true },
      })
      // JWTs outlive deleted accounts and changes to the admin allowlist.
      // Every protected operation must use the current account identity.
      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      sessionErrorLogged = false
      return {
        user: {
          ...currentUser,
          role: resolveAuthTeamRole(currentUser.email),
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
