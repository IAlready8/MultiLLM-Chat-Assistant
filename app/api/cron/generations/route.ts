import { timingSafeEqual } from 'node:crypto'
import { reconcileExpiredGenerations } from '@/services/generation-service'
import { prunePostgresLimits } from '@/lib/postgres-rate-limit'

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || secret.length < 16) return Response.json({ error: 'Recovery scheduler is not configured' }, { status: 503 })
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const started = Date.now()
    let recovered = 0
    let batchFull = false
    do {
      const result = await reconcileExpiredGenerations()
      recovered += result.recovered
      batchFull = result.batchFull
    } while (batchFull && Date.now() - started < 40_000)
    if (process.env.RATE_LIMIT_BACKEND === 'postgres') await prunePostgresLimits()
    return Response.json({ recovered, more: batchFull }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('Generation reconciliation failed')
    return Response.json({ error: 'Recovery failed; retry the scheduled job' }, { status: 503 })
  }
}
