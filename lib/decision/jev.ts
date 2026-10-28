import { z } from 'zod'

/** Jev is a decision API, not a chat-completions provider. Keep its credentials server-only. */
export const decisionInputSchema = z.object({
  state: z.string().trim().min(1).max(20_000),
  candidates: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_.:/-]{1,128}$/),
    description: z.string().trim().min(1).max(500),
  })).min(2).max(16),
  question: z.string().trim().min(1).max(1000).default('Which candidate best fits this request?'),
}).refine(value => new Set(value.candidates.map(candidate => candidate.id)).size === value.candidates.length, {
  message: 'Candidate IDs must be unique',
})

export type DecisionInput = z.infer<typeof decisionInputSchema>

const answerSchema = z.object({
  answers: z.object({
    route: z.object({
      choice: z.string(),
      confidence: z.number().finite().min(0).max(1),
    }).passthrough(),
  }).passthrough(),
  model: z.string().optional(),
}).passthrough()

export class JevUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JevUnavailableError'
  }
}

export async function evaluateJevChoice(input: DecisionInput, signal?: AbortSignal) {
  const key = process.env.TYPESAFE_API_KEY?.trim()
  if (!key) throw new JevUnavailableError('Jev decision service is not configured')
  if (process.env.JEV_SHADOW_ENABLED !== 'true') {
    throw new JevUnavailableError('Jev shadow evaluation is disabled')
  }
  const model = process.env.JEV_MODEL?.trim() || 'jev-latest'
  const startedAt = Date.now()
  const timeout = AbortSignal.timeout(5000)
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      state: input.state,
      questions: {
        route: {
          type: 'choice',
          instructions: input.question,
          criteria: Object.fromEntries(input.candidates.map(candidate => [candidate.id, candidate.description])),
        },
      },
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new JevUnavailableError(`Jev returned HTTP ${response.status}`)
  const body = await response.text()
  if (body.length > 100_000) throw new JevUnavailableError('Jev response exceeded size limit')
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { throw new JevUnavailableError('Invalid Jev response') }
  const result = answerSchema.safeParse(parsed)
  if (!result.success) throw new JevUnavailableError('Malformed Jev decision response')
  const { choice, confidence } = result.data.answers.route
  if (!input.candidates.some(candidate => candidate.id === choice)) {
    throw new JevUnavailableError('Jev returned a candidate outside the allowed set')
  }
  return { choice, confidence, model: result.data.model || model, latencyMs: Date.now() - startedAt }
}
