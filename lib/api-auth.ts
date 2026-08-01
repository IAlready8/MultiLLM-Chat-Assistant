import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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
      sessionErrorLogged = false
      return { user: session.user as unknown as User }
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
      console.error('Failed to read session:', error)
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
