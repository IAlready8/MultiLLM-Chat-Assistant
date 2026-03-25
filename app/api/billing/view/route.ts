import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { logger } from '@/lib/logger'

const readSource = async (req: Request) => {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return 'billing_page'
  }

  try {
    const body = await req.json() as { source?: unknown }
    if (typeof body.source === 'string' && body.source.trim()) {
      return body.source.trim().slice(0, 64)
    }
  } catch {
    return 'billing_page'
  }

  return 'billing_page'
}

export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const source = await readSource(req)

  try {
    await recordAnalyticsEvent({
      event: 'billing_viewed',
      userId: user.id,
      payload: { source },
    })
  } catch (error) {
    logger.warn('billing_view_analytics_failed', {
      route: '/api/billing/view',
      userId: user.id,
      error,
    })
  }

  return NextResponse.json({ ok: true })
}
