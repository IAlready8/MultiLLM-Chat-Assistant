import { NextResponse } from 'next/server'
import { getAuthenticatedAdmin } from '@/lib/api-auth'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'
import { getRecentLoopRuns } from '@/lib/loops/event-ledger'

const parsePositiveInteger = (
  value: string | null,
  fallback: number,
  maximum: number
): number => {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, maximum)
}

export const GET = withApiMetrics(async (request: Request) => {
  const authCheck = await getAuthenticatedAdmin()
  if (authCheck instanceof NextResponse) {
    return authCheck
  }

  const url = new URL(request.url)
  const loopId = url.searchParams.get('loopId')?.trim() || undefined
  const limit = parsePositiveInteger(url.searchParams.get('limit'), 20, 100)
  const days = parsePositiveInteger(url.searchParams.get('days'), 30, 365)
  const runs = await getRecentLoopRuns(authCheck.user.id, {
    loopId,
    limit,
    days,
  })

  return NextResponse.json(
    {
      source: 'loop-event-ledger',
      runs,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
})
