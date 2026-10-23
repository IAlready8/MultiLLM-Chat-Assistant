import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { checkAndConsume } from '@/lib/rate-limit'
import { readBoundedJson } from '@/lib/llm-request'
import { decisionInputSchema, evaluateJevChoice, JevUnavailableError } from '@/lib/decision/jev'
import { recordAnalyticsEvent } from '@/services/analytics-service'

export const maxDuration = 15

/** Evaluates a recommendation; never invokes the selected model. */
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  if (process.env.JEV_SHADOW_ENABLED !== 'true' || !process.env.TYPESAFE_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Shadow decisions are disabled' }, { status: 503 })
  }
  try {
    const limit = await checkAndConsume(`jev-shadow:${auth.user.id}`, { max: 20, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    const parsed = decisionInputSchema.safeParse(await readBoundedJson(request, 32_768))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid decision request' }, { status: 400 })
    const result = await evaluateJevChoice(parsed.data, request.signal)
    await recordAnalyticsEvent({
      userId: auth.user.id,
      event: 'jev_shadow_decision',
      payload: {
        decisionId: crypto.randomUUID(),
        model: result.model,
        candidates: parsed.data.candidates.map(candidate => candidate.id),
        choice: result.choice,
        confidence: result.confidence,
        latencyMs: result.latencyMs,
        outcome: null,
        mode: 'shadow',
      },
    })
    return NextResponse.json({ ...result, executed: false, mode: 'shadow' }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof JevUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Decision service timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Decision service failed' }, { status: 502 })
  }
}
