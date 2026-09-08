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
  requests: z.array(z.object({
    provider: z.string().trim().min(1).max(64).transform(value => value.toLowerCase()),
    model: z.string().trim().min(1).max(256),
    prompt: z.string().max(10_000),
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
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)])
    const sidecar = process.env.PYTHON_CORE_URL?.trim()
    if (sidecar) {
      const disabled = input.requests.find(item => isProviderDisabled(item.provider))
      if (disabled) throw new LlmRequestError(getProviderDisabledMessage(disabled.provider), 503, PROVIDER_DISABLED_ERROR_CODE)
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
        try {
          signal.throwIfAborted()
          const result = await executeChat(auth.user.id, { provider: item.provider, model: item.model, messages: [{ role: 'user', content: item.prompt || input.prompt }], stream: false }, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
          results[index] = { provider: item.provider, model: item.model, content: result.content, ...result.usage, cost_usd: null, latency_ms: Date.now() - started, status: 'complete' }
        } catch (error) {
          const mapped = classifyProviderError(error)
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
