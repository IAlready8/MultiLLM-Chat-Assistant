import { z } from 'zod'
import { evaluateJevChoice } from '@/lib/decision/jev'
import { getModelsForProvider } from '@/lib/model-catalog'
import { isProviderOperational } from '@/lib/provider-registry'
import { estimateModelCost } from '@/lib/model-pricing'
import { getParsedAnalyticsEvents, recordAnalyticsEvent } from '@/services/analytics-service'

export const modelCandidateSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(256),
  description: z.string().max(500).default(''),
})
export const routingSchema = z.object({
  task: z.string().trim().min(1).max(12000),
  candidates: z.array(modelCandidateSchema).min(2).max(12),
  estimatedInputTokens: z.number().int().min(0).max(500000).default(1500),
  estimatedOutputTokens: z.number().int().min(0).max(50000).default(800),
  maxEstimatedCostUsd: z.number().finite().nonnegative().optional(),
  mode: z.enum(['shadow', 'recommend']).default('shadow'),
})
export const agentSchema = z.object({
  state: z.string().trim().min(1).max(12000),
  actions: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    description: z.string().trim().min(1).max(500),
  })).min(2).max(12),
})
export const contextSchema = z.object({
  goal: z.string().trim().min(1).max(4000),
  items: z.array(z.object({ id: z.string().min(1).max(80), text: z.string().max(8000) })).min(1).max(24),
  maxCharacters: z.number().int().min(100).max(100000).default(16000),
})
export const outcomeSchema = z.object({
  decisionId: z.string().uuid(),
  correct: z.boolean(),
})
export const POLICY_VERSION = 'jev-policy-v1'
export const POLICY: Readonly<Record<string, number>> = Object.freeze({
  routing: 0.90,
  agent: 0.97,
  context: 0.85,
})
export function permitted(kind: keyof typeof POLICY, confidence: number): boolean {
  return Number.isFinite(confidence) && confidence >= POLICY[kind]
}
function unique<T>(array: T[], key: (v: T) => string) {
  return new Set(array.map(key)).size === array.length
}
export function estimateCandidateCost(candidate: z.infer<typeof modelCandidateSchema>, input: number, output: number) {
  const cost = estimateModelCost(candidate.provider, candidate.model, {
    promptTokens: input, completionTokens: output,
  })
  return { usd: cost.totalUsd, precision: cost.precision }
}
export function eligibleCandidates(input: z.infer<typeof routingSchema>) {
  if (!unique(input.candidates, c => c.provider + ':' + c.model)) throw new Error('Duplicate candidates')
  return input.candidates.flatMap(candidate => {
    if (!isProviderOperational(candidate.provider)) return []
    if (!getModelsForProvider(candidate.provider).some(model => model.id === candidate.model && !model.isDeprecated)) return []
    const cost = estimateCandidateCost(candidate, input.estimatedInputTokens, input.estimatedOutputTokens)
    // A provider-fallback cost is not a verified price: never use it to approve a hard cost cap.
    if (input.maxEstimatedCostUsd !== undefined && (cost.precision !== 'model' || cost.usd > input.maxEstimatedCostUsd)) return []
    return [{ ...candidate, cost }]
  })
}
export async function recordDecision(userId: string, kind: string, choice: string, confidence: number, details: Record<string, unknown>) {
  const decisionId = crypto.randomUUID()
  await recordAnalyticsEvent({
    userId, event: 'jev_decision_v2',
    payload: { decisionId, kind, choice, confidence, policyVersion: POLICY_VERSION, threshold: POLICY[kind] ?? null, ...details },
  })
  return decisionId
}
export async function routeModel(userId: string, raw: z.input<typeof routingSchema>, signal?: AbortSignal) {
  const input = routingSchema.parse(raw)
  const candidates = eligibleCandidates(input)
  if (candidates.length < 2) throw new Error('At least two eligible models are required')
  const selected = await evaluateJevChoice({
    state: input.task,
    question: 'Choose the best available model for the task. Consider capability, estimated price, and task match. Return only an allowed choice.',
    candidates: candidates.map((c, i) => ({
      id: 'c' + i,
      description: c.provider + '/' + c.model + ': ' + c.description + '; estimated cost USD ' + c.cost.usd + ' (' + c.cost.precision + ')',
    })),
  }, signal)
  const index = Number(selected.choice.slice(1))
  const choice = candidates[index]
  if (!choice || selected.choice !== 'c' + index) throw new Error('Invalid model decision')
  const approved = permitted('routing', selected.confidence)
  const decisionId = await recordDecision(userId, 'routing', choice.provider + '/' + choice.model, selected.confidence, {
    candidateIds: candidates.map(c => c.provider + '/' + c.model),
    estimatedCostUsd: choice.cost.usd, costPrecision: choice.cost.precision,
    approved, outcome: null, latencyMs: selected.latencyMs, model: selected.model,
  })
  return { decisionId, selection: choice, confidence: selected.confidence, approved, policyVersion: POLICY_VERSION,
    mode: input.mode, executed: false, estimatedCostOnly: true }
}
export async function chooseAgentAction(userId: string, raw: z.input<typeof agentSchema>, signal?: AbortSignal) {
  const input = agentSchema.parse(raw)
  if (!unique(input.actions, a => a.id)) throw new Error('Duplicate actions')
  const r = await evaluateJevChoice({
    state: input.state, question: 'Which proposed action is most appropriate? This is a recommendation only.',
    candidates: input.actions,
  }, signal)
  const approved = permitted('agent', r.confidence)
  const decisionId = await recordDecision(userId, 'agent', r.choice, r.confidence, {
    candidateIds: input.actions.map(a => a.id), approved, outcome: null, model: r.model,
  })
  return { decisionId, action: r.choice, confidence: r.confidence, approved, requiresExternalAuthorization: true,
    executed: false, policyVersion: POLICY_VERSION }
}
export async function selectContext(userId: string, raw: z.input<typeof contextSchema>, signal?: AbortSignal) {
  const input = contextSchema.parse(raw)
  if (!unique(input.items, a => a.id)) throw new Error('Duplicate context IDs')
  const kept = []
  let remaining = input.maxCharacters
  // Score in chunks with bounded candidate arrays; never rewrite surviving source text.
  for (let offset = 0; offset < input.items.length; offset += 12) {
    const chunk = input.items.slice(offset, offset + 12)
    for (const item of chunk) {
      if (remaining <= 0) break
      // Two explicit typed options. Preserve original text exactly if chosen and admitted.
      const r = await evaluateJevChoice({
        state: input.goal + '\nCandidate: ' + item.text.slice(0, 7000),
        question: 'Is this item relevant to the goal and worth retaining?',
        candidates: [{ id: 'keep', description: 'Relevant evidence needed for goal' }, { id: 'drop', description: 'Irrelevant to goal' }],
      }, signal)
      const keep = r.choice === 'keep' && permitted('context', r.confidence)
      if (keep && item.text.length <= remaining) {
        kept.push(item)
        remaining -= item.text.length
      }
    }
  }
  const decisionId = await recordDecision(userId, 'context', 'selection', 1, {
    retainedIds: kept.map(x => x.id), originalCount: input.items.length, retainedCount: kept.length, outcome: null,
  })
  return { decisionId, items: kept, remainingCharacters: remaining, rewritten: false, policyVersion: POLICY_VERSION }
}
export async function recordOutcome(userId: string, raw: z.input<typeof outcomeSchema>) {
  const input = outcomeSchema.parse(raw)
  const events = await getParsedAnalyticsEvents(userId, 90)
  const source = events.find(e => e.event === 'jev_decision_v2' && e.payload.decisionId === input.decisionId)
  if (!source) throw new Error('Decision not found in recent user history')
  if (events.some(e => e.event === 'jev_outcome_v2' && e.payload.decisionId === input.decisionId)) throw new Error('Outcome already recorded')
  await recordAnalyticsEvent({ userId, event: 'jev_outcome_v2', payload: { decisionId: input.decisionId, correct: input.correct } })
  return { decisionId: input.decisionId, recorded: true }
}
export async function decisionMetrics(userId: string) {
  const events = await getParsedAnalyticsEvents(userId, 90)
  const outcomes = new Map(events.filter(e => e.event === 'jev_outcome_v2').map(e => [String(e.payload.decisionId), e.payload.correct]))
  const rows = events.filter(e => e.event === 'jev_decision_v2')
    .filter(e => typeof e.payload.confidence === 'number' && outcomes.has(String(e.payload.decisionId)))
  if (!rows.length) return { labeledCount: 0, brier: null, calibrationGap: null, accuracy: null }
  const scores = rows.map(e => ({
    p: Number(e.payload.confidence), y: outcomes.get(String(e.payload.decisionId)) === true ? 1 : 0,
  }))
  const brier = scores.reduce((n, x) => n + (x.p - x.y) ** 2, 0) / scores.length
  const accuracy = scores.reduce((n, x) => n + x.y, 0) / scores.length
  const calibrationGap = Math.abs(scores.reduce((n, x) => n + x.p, 0) / scores.length - accuracy)
  return { labeledCount: scores.length, brier, calibrationGap, accuracy, note: 'CalibrationGap is aggregate; not bucketed ECE. Observational, not independently verified.' }
}
