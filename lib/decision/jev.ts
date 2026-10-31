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

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const MAX_JEV_RESPONSE_CHARS = 100_000

const choiceAnswerSchema = z.object({
  choice: z.string(),
  confidence: z.number().finite().min(0).max(1),
  probabilities: z.record(z.string(), z.number().finite()).optional(),
}).passthrough()

const responseSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  model: z.string().optional(),
}).passthrough()

export class JevUnavailableError extends Error {
  constructor(message: string, readonly upstreamStatus?: number) {
    super(message)
    this.name = 'JevUnavailableError'
  }
}

export interface JevChoiceRequest {
  apiKey: string
  model: string
  state: string
  /** Name of the single choice question; the answer is read back from `answers[questionName]`. */
  questionName: string
  instructions: string
  /** Allowed choices mapped to their descriptions. Jev may only return one of these keys. */
  criteria: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal
}

export interface JevChoiceAnswer {
  choice: string
  confidence: number
  probabilities: Record<string, number>
  model: string
  latencyMs: number
}

/**
 * The one HTTP client for TypeSafe's `POST /v1/systemone` choice questions.
 * Request shape follows the documented contract: `questions` is an object keyed by
 * question name, and a choice question carries `type`, `instructions` and a
 * `criteria` map of allowed choices. Fixed host, no redirects, bounded response.
 */
export async function requestJevChoice(request: JevChoiceRequest): Promise<JevChoiceAnswer> {
  const startedAt = Date.now()
  const timeout = AbortSignal.timeout(request.timeoutMs)
  const response = await fetch(JEV_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: request.model,
      state: request.state,
      questions: {
        [request.questionName]: {
          type: 'choice',
          instructions: request.instructions,
          criteria: request.criteria,
        },
      },
    }),
    signal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new JevUnavailableError(`Jev returned HTTP ${response.status}`, response.status)
  const body = await response.text()
  if (body.length > MAX_JEV_RESPONSE_CHARS) throw new JevUnavailableError('Jev response exceeded size limit')
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { throw new JevUnavailableError('Invalid Jev response') }
  const envelope = responseSchema.safeParse(parsed)
  if (!envelope.success) throw new JevUnavailableError('Malformed Jev decision response')
  const answer = choiceAnswerSchema.safeParse(envelope.data.answers[request.questionName])
  if (!answer.success) throw new JevUnavailableError('Malformed Jev decision response')
  const { choice, confidence, probabilities } = answer.data
  if (!Object.prototype.hasOwnProperty.call(request.criteria, choice)) {
    throw new JevUnavailableError('Jev returned a candidate outside the allowed set')
  }
  return {
    choice,
    confidence,
    probabilities: probabilities ?? {},
    model: envelope.data.model || request.model,
    latencyMs: Date.now() - startedAt,
  }
}

export async function evaluateJevChoice(input: DecisionInput, signal?: AbortSignal) {
  const key = process.env.TYPESAFE_API_KEY?.trim()
  if (!key) throw new JevUnavailableError('Jev decision service is not configured')
  if (process.env.JEV_SHADOW_ENABLED !== 'true') {
    throw new JevUnavailableError('Jev shadow evaluation is disabled')
  }
  const result = await requestJevChoice({
    apiKey: key,
    model: process.env.JEV_MODEL?.trim() || 'jev-latest',
    state: input.state,
    questionName: 'route',
    instructions: input.question,
    criteria: Object.fromEntries(input.candidates.map(candidate => [candidate.id, candidate.description])),
    timeoutMs: 5000,
    signal,
  })
  return { choice: result.choice, confidence: result.confidence, model: result.model, latencyMs: result.latencyMs }
}
