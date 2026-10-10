import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { storeUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const configSchema = z.object({
  key: z.string().min(1).max(200).optional(),
  enabled: z.boolean(),
})

/**
 * GET /api/jev/config
 * Returns Jev configuration status (never exposes the key).
 */
export async function GET() {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const configs = await getUserProviderConfigs(user.id)
    const jev = configs.find((c) => c.provider === 'jev')

    if (!jev) {
      return NextResponse.json({ configured: false, enabled: false })
    }

    const settings = jev.settings ?? {}
    const enabled = settings.jevJudgingEnabled === true

    return NextResponse.json({
      configured: !!jev.apiKey,
      enabled: enabled && jev.isActive,
      hasKey: !!jev.apiKey,
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to load Jev configuration' },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/jev/config
 * Save Jev API key and enabled toggle.
 */
export async function PUT(request: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = configSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { key: apiKey, enabled } = parsed.data

  try {
    // Load existing to preserve key if not provided
    const configs = await getUserProviderConfigs(user.id)
    const existing = configs.find((c) => c.provider === 'jev')

    if (apiKey) {
      // Store new key with enabled flag
      await storeUserApiKey(user.id, 'jev', apiKey, {
        jevJudgingEnabled: enabled,
      })
    } else if (existing) {
      // Update only the enabled flag, preserve existing key
      const settings = { ...(existing.settings ?? {}), jevJudgingEnabled: enabled }
      await prisma.providerConfig.update({
        where: { userId_provider: { userId: user.id, provider: 'jev' } },
        data: { settings: JSON.stringify(settings), updatedAt: new Date() },
      })
    } else if (enabled) {
      return NextResponse.json(
        { error: 'API key is required to enable Jev judging.' },
        { status: 400 },
      )
    }

    return NextResponse.json({ configured: true, enabled })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save Jev configuration' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/jev/config
 * Remove Jev configuration entirely.
 */
export async function DELETE() {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { deleteUserProviderConfig } = await import('@/lib/api-key-service')
    await deleteUserProviderConfig(user.id, 'jev')
    return NextResponse.json({ configured: false, enabled: false })
  } catch {
    return NextResponse.json(
      { error: 'Failed to remove Jev configuration' },
      { status: 500 },
    )
  }
}
