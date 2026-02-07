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
    const cookieStore = cookies()
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
      // We can cast here because our NextAuth config ensures user.id exists
      return { user: session.user as unknown as User }
    }

    if (allowGuest) {
      return { user: createGuestUserRecord() }
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  } catch (error) {
    console.error('Failed to read session:', error)

    if (allowGuest) {
      return { user: createGuestUserRecord() }
    }

    return NextResponse.json({ error: 'Auth unavailable' }, { status: 503 })
  }
}
