import { auth } from '@/lib/auth'
import {
  createDemoUserRecord,
  createGuestUserRecord,
  getDemoAccountContext,
  isStrictAuthRequired,
} from '@/lib/demo-account'
import { User } from '@/types/prisma'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

type GetAuthenticatedUserOptions = {
  allowGuest?: boolean
}

type RoleAwareUser = User & {
  role?: string | null
}

// Tracks whether we've already logged a session error to avoid log spam
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
 * A helper function to get the authenticated user from a server-side API request.
 * Encapsulates the logic for checking the session and returning a 401 response.
 *
 * @returns {Promise<{user: User} | NextResponse>}
 * - An object with the user if authenticated.
 * - A NextResponse with a 401 status if not authenticated.
 */
export async function getAuthenticatedUser(
  options: GetAuthenticatedUserOptions = {}
): Promise<{ user: User } | NextResponse> {
  const demoAccount = getDemoAccountContext()
  const strictAuth = isStrictAuthRequired()
  const allowGuest = !strictAuth && options.allowGuest === true

  if (!strictAuth && demoAccount.enabled && demoAccount.bypassAuth) {
    return { user: createDemoUserRecord() }
  }

  if (allowGuest && !strictAuth) {
    const cookieStore = await cookies()
    const hasSessionToken =
      Boolean(cookieStore.get('next-auth.session-token')) ||
      Boolean(cookieStore.get('__Secure-next-auth.session-token'))

    if (!hasSessionToken) {
      return { user: createGuestUserRecord() }
    }
  }

  try {
    const session = await auth()
    if (session?.user?.id) {
      sessionErrorLogged = false
      return { user: session.user as unknown as User }
    }

    if (allowGuest) {
      return { user: createGuestUserRecord() }
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } catch (error) {
    // JWT decryption failures (e.g., rotated secret, corrupted cookie)
    // are auth problems, not server errors — treat as "no session"
    if (isJwtDecryptionError(error)) {
      if (!sessionErrorLogged) {
        sessionErrorLogged = true
        console.warn(
          'Session token could not be decrypted (likely rotated secret or legacy cookie). Treating as unauthenticated.'
        )
      }

      if (allowGuest) {
        return { user: createGuestUserRecord() }
      }

      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    // Other errors (DB down, network issues, etc.)
    if (!sessionErrorLogged) {
      sessionErrorLogged = true
      console.error('Failed to read session:', error)
    }

    if (allowGuest) {
      return { user: createGuestUserRecord() }
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
