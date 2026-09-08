import { reserveLlmQuota } from '@/lib/llm-quota'
import { beginGeneration, finishGeneration } from '@/services/generation-service'
import { checkAndConsume } from '@/lib/rate-limit'
import { validateModelRequest } from '@/lib/model-contract'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { executeChat, llmErrorResponse } from '@/lib/llm-runtime'
import { LlmRequestError, readBoundedJson } from '@/lib/llm-request'
import { isProviderDisabled, getProviderDisabledMessage, PROVIDER_DISABLED_ERROR_CODE } from '@/lib/provider-registry'
import { classifyProviderError } from '@/lib/providers'

export const maxDuration = 60

const schema = z.object({
  prompt: z.string().max(10_000),
  conversationId: z.string().min(1).max(128).optional(),
  turnId: z.string().uuid().optional(),
  requests: z.array(z.object({
    provider: z.string().trim().min(1).max(64).transform(value => value.toLowerCase()),
    model: z.string().trim().min(1).max(256),
    prompt: z.string().max(10_000),
    requestId: z.string().uuid().optional(),
  })).min(1).max(8),
}).refine(value => value.requests.every(item => (item.prompt || value.prompt).trim().length > 0))

const sidecarResultSchema = z.array(z.object({
  provider: z.string(), model: z.string(), content: z.string().max(1_048_576),
  prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().finite().nonnegative().nullable(), latency_ms: z.number().finite().nonnegative(),
})).max(8)

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  try {
    const parsed = schema.safeParse(await readBoundedJson(request))
    if (!parsed.success) throw new LlmRequestError('Invalid orchestration input')
    const input = parsed.data
    if (input.conversationId && (!input.turnId || input.requests.some(item => !item.requestId))) throw new LlmRequestError('Saved orchestration requires turn and request IDs')
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)])
    // Durable work uses the native provider lifecycle and the user's credentials.
    const sidecar = input.conversationId ? undefined : process.env.PYTHON_CORE_URL?.trim()
    if (sidecar) {
      const disabled = input.requests.find(item => isProviderDisabled(item.provider))
      if (disabled) throw new LlmRequestError(getProviderDisabledMessage(disabled.provider), 503, PROVIDER_DISABLED_ERROR_CODE)
      for (const item of input.requests) validateModelRequest(item.provider, { model: item.model, messages: [{ role: 'user', content: item.prompt || input.prompt }] })
      const limit = await checkAndConsume(`orchestration:${auth.user.id}`, { max: 60, windowMs: 60_000 })
      if (!limit.allowed) throw new LlmRequestError('Rate limit exceeded', 429, 'RATE_LIMITED', Math.max(1, Math.ceil(limit.retryAfterMs / 1000)))
      await reserveLlmQuota(auth.user.id, input.requests.length)
      const response = await fetch(`${sidecar.replace(/\/+$/, '')}/api/v1/llm/orchestrate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), signal, redirect: 'error',
      })
      // A failed sidecar call may already have generated billable responses.
      // Never automatically dispatch the same batch again through another path.
      if (!response.ok) throw new LlmRequestError('Orchestration service is unavailable', 502, 'ORCHESTRATION_UNAVAILABLE')
      const payload = await readBoundedJson(response, 8 * 1_048_576).catch(() => { throw new LlmRequestError('Orchestration service returned malformed results', 502, 'PROVIDER_MALFORMED_RESPONSE') })
      const result = sidecarResultSchema.safeParse(payload)
      if (!result.success || result.data.length !== input.requests.length || result.data.some((item, index) => item.provider !== input.requests[index].provider || item.model !== input.requests[index].model)) throw new LlmRequestError('Orchestration service returned malformed results', 502, 'PROVIDER_MALFORMED_RESPONSE')
      return NextResponse.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
    }

    const results = new Array(input.requests.length)
    let next = 0
    const worker = async () => {
      while (next < input.requests.length) {
        const index = next++
        const item = input.requests[index]
        const started = Date.now()
        let generationId: string | undefined
        try {
          signal.throwIfAborted()
          if (input.conversationId && input.turnId && item.requestId) {
            const generation = await beginGeneration(auth.user.id, { provider: item.provider, model: item.model, messages: [{ role: 'user', content: item.prompt || input.prompt }], conversationId: input.conversationId, turnId: input.turnId, requestId: item.requestId, position: index })
            if (generation.replay !== null) {
              results[index] = { provider: item.provider, model: item.model, content: generation.replay, prompt_tokens: 0, completion_tokens: 0, cost_usd: null, latency_ms: 0, status: 'complete', replay: true, usage_source: 'unknown' }
              continue
            }
            generationId = generation.id
          }
          const result = await executeChat(auth.user.id, { provider: item.provider, model: item.model, messages: [{ role: 'user', content: item.prompt || input.prompt }], stream: false }, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
          if (generationId) await finishGeneration(auth.user.id, generationId, result.content, 'complete', result.usage)
          results[index] = { provider: item.provider, model: item.model, content: result.content, ...result.usage, cost_usd: null, latency_ms: Date.now() - started, status: 'complete' }
        } catch (error) {
          const mapped = classifyProviderError(error)
          if (generationId) {
            try { await finishGeneration(auth.user.id, generationId, '', request.signal.aborted ? 'canceled' : 'failed') } catch { console.error('Orchestration generation persistence failed') }
          }
          results[index] = { provider: item.provider, model: item.model, content: '', prompt_tokens: 0, completion_tokens: 0, cost_usd: null, latency_ms: Date.now() - started, status: 'failed', error: mapped.error, code: mapped.code, usage_source: 'unknown' }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, input.requests.length) }, worker))
    return NextResponse.json(results, { headers: { 'x-orchestration-fallback': 'native', 'Cache-Control': 'no-store' } })
  } catch (error) {
    return llmErrorResponse(error)
  }
}
