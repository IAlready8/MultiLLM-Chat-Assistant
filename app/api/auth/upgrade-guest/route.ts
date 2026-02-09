import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { migrateGuestData } from '@/lib/guest-migration'

/**
 * POST /api/auth/upgrade-guest
 *
 * Migrates in-memory guest data (goals, provider configs, conversations)
 * to the authenticated user's database records. Called automatically after
 * a guest user signs up or signs in.
 *
 * Requires an active session — the user must already be authenticated.
 * The guest user ID is passed in the request body.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Prevent migration for demo/guest user IDs
  if (userId === 'demo-user' || userId.startsWith('guest-')) {
    return NextResponse.json(
      { error: 'Cannot migrate guest data to a guest account' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const guestUserId =
      typeof body.guestUserId === 'string'
        ? body.guestUserId.trim()
        : 'guest-local-user'

    const result = await migrateGuestData(guestUserId, userId)

    return NextResponse.json({
      migrated: true,
      counts: result,
    })
  } catch (error) {
    console.error('Guest data migration failed:', error)
    return NextResponse.json(
      { error: 'Migration failed' },
      { status: 500 }
    )
  }
}
