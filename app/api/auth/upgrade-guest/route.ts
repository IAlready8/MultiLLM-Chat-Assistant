import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiLog } from '@/lib/api-logger'
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
  const startedAt = Date.now()
  const logUpgradeRequest = (options: {
    status: number
    userId?: string
    guestUserId?: string
    error?: string
    counts?: {
      goals: number
      providerConfigs: number
      conversations: number
      personas: number
    }
  }) => {
    const totalMigrated = options.counts
      ? options.counts.goals +
        options.counts.providerConfigs +
        options.counts.conversations +
        options.counts.personas
      : undefined

    apiLog.request({
      method: 'POST',
      path: '/api/auth/upgrade-guest',
      status: options.status,
      durationMs: Math.max(0, Date.now() - startedAt),
      userId: options.userId,
      error: options.error,
      meta: {
        guestUserId: options.guestUserId,
        counts: options.counts,
        totalMigrated,
      },
    })
  }

  const session = await auth()
  if (!session?.user?.id) {
    logUpgradeRequest({
      status: 401,
      error: 'Unauthorized',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Prevent migration for demo/guest user IDs
  if (userId === 'demo-user' || userId.startsWith('guest-')) {
    logUpgradeRequest({
      status: 400,
      userId,
      error: 'Cannot migrate guest data to a guest account',
    })
    return NextResponse.json(
      { error: 'Cannot migrate guest data to a guest account' },
      { status: 400 }
    )
  }

  let guestUserId = 'guest-local-user'

  try {
    const body = await request.json()
    guestUserId =
      typeof body.guestUserId === 'string'
        ? body.guestUserId.trim()
        : guestUserId

    const result = await migrateGuestData(guestUserId, userId)

    logUpgradeRequest({
      status: 200,
      userId,
      guestUserId,
      counts: result,
    })

    return NextResponse.json({
      migrated: true,
      counts: result,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Guest data migration failed'
    console.error('Guest data migration failed:', error)
    logUpgradeRequest({
      status: 500,
      userId,
      guestUserId,
      error: message,
    })
    return NextResponse.json(
      { error: 'Migration failed' },
      { status: 500 }
    )
  }
}
