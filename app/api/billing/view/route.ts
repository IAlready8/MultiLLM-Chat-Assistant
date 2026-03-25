import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { logger } from '@/lib/logger'
import { readBillingSource } from '@/lib/billing-source'

export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const source = await readBillingSource(req, { defaultValue: 'billing_page' })

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
