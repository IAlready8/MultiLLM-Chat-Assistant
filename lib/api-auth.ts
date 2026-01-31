import { auth } from '@/lib/auth'
import { User } from '@prisma/client'
import { NextResponse } from 'next/server'

/**
 * A helper function to get the authenticated user from a server-side API request.
 * Encapsulates the logic for checking the session and returning a 401 response.
 *
 * @returns {Promise<{user: User} | NextResponse>}
 * - An object with the user if authenticated.
 * - A NextResponse with a 401 status if not authenticated.
 */
export async function getAuthenticatedUser(): Promise<{ user: User } | NextResponse> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // We can cast here because our NextAuth config ensures user.id exists
    return { user: session.user as unknown as User }
  } catch (error) {
    console.error('Failed to read session:', error)
    return NextResponse.json({ error: 'Auth unavailable' }, { status: 503 })
  }
}
