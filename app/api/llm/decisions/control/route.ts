import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { readBoundedJson } from '@/lib/llm-request'
import { checkAndConsume } from '@/lib/rate-limit'
import { routeModel, chooseAgentAction, selectContext, recordOutcome, decisionMetrics, routingSchema, agentSchema, contextSchema, outcomeSchema } from '@/lib/decision/control-plane'

export const maxDuration = 60
const requestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('route'), input: routingSchema }),
  z.object({ operation: z.literal('agent'), input: agentSchema }),
  z.object({ operation: z.literal('context'), input: contextSchema }),
  z.object({ operation: z.literal('outcome'), input: outcomeSchema }),
  z.object({ operation: z.literal('metrics') }),
])
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  if (process.env.JEV_SHADOW_ENABLED !== 'true' || !process.env.TYPESAFE_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Jev decision engine is disabled' }, { status: 503 })
  }
  try {
    const limit = await checkAndConsume('jev-control:' + auth.user.id, { max: 30, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    const parsed = requestSchema.safeParse(await readBoundedJson(request, 100_000))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid decision request' }, { status: 400 })
    const data = parsed.data
    let result: unknown
    switch (data.operation) {
      case 'route': result = await routeModel(auth.user.id, data.input, request.signal); break
      case 'agent': result = await chooseAgentAction(auth.user.id, data.input, request.signal); break
      case 'context': result = await selectContext(auth.user.id, data.input, request.signal); break
      case 'outcome': result = await recordOutcome(auth.user.id, data.input); break
      case 'metrics': result = await decisionMetrics(auth.user.id); break
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Decision engine failed'
    const validation = error instanceof z.ZodError || /Duplicate|not found|already recorded|eligible/.test(message)
    return NextResponse.json({ error: validation ? message : 'Decision evaluation unavailable' }, { status: validation ? 400 : 502 })
  }
}
