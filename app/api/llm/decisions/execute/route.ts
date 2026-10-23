import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { checkAndConsume } from '@/lib/rate-limit'
import { readBoundedJson } from '@/lib/llm-request'
import { executeChat, llmErrorResponse } from '@/lib/llm-runtime'
import { routeModel, routingSchema } from '@/lib/decision/control-plane'
import { getUserProviderConfigs } from '@/lib/api-key-service'

export const maxDuration = 60

const schema = z.object({
  task: z.string().trim().min(1).max(10000),
  routing: routingSchema.omit({ task: true, mode: true }),
  mode: z.enum(['shadow', 'execute']).default('shadow'),
  requestId: z.string().uuid().optional(),
})

/** Explicit opt-in, one model dispatch at most. Never retries a potentially billable call. */
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  if (process.env.JEV_SHADOW_ENABLED !== 'true' || !process.env.TYPESAFE_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Jev routing is not configured' }, { status: 503 })
  }
  try {
    const limited = await checkAndConsume('jev-execute:' + auth.user.id, { max: 10, windowMs: 60_000 })
    if (!limited.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    const parsed = schema.safeParse(await readBoundedJson(request, 64_000))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid routing input' }, { status: 400 })
    const input = parsed.data
    if (input.mode === 'execute' && process.env.JEV_AUTO_ROUTING_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Automatic routing is disabled' }, { status: 503 })
    }
    // No runtime attempt for providers the user has not explicitly configured.
    const configs = await getUserProviderConfigs(auth.user.id)
    const configured = input.routing.candidates.filter(c => configs.some(x => x.provider === c.provider))
    if (configured.length < 2) {
      return NextResponse.json({ error: 'Configure at least two eligible providers' }, { status: 400 })
    }
    const result = await routeModel(auth.user.id, {
      ...input.routing, task: input.task, candidates: configured,
      mode: input.mode === 'execute' ? 'recommend' : 'shadow',
    }, request.signal)
    if (input.mode === 'shadow') return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    if (!result.approved) {
      return NextResponse.json({ ...result, executed: false, reason: 'CONFIDENCE_BELOW_POLICY' }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const chosen = result.selection
    // executeChat enforces existing credential, quota, model contract, adapter and provider rate-limit checks.
    // The selected model receives the user's task verbatim; no autonomous tools are executed.
    const response = await executeChat(auth.user.id, {
      provider: chosen.provider, model: chosen.model,
      messages: [{ role: 'user', content: input.task }], stream: false,
    }, AbortSignal.any([request.signal, AbortSignal.timeout(30000)]))
    return NextResponse.json({
      ...result, executed: true, result: response.content, usage: response.usage,
      actualCostUsd: null, // recorded token usage is not an invoice
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return llmErrorResponse(error)
  }
}
