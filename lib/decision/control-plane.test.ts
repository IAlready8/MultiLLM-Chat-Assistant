import { describe, expect, it } from 'vitest'
import { eligibleCandidates, estimateCandidateCost, permitted, POLICY_VERSION, routingSchema, contextSchema, agentSchema } from './control-plane'

describe('decision control plane', () => {
  it('has explicit versioned thresholds', () => {
    expect(POLICY_VERSION).toBe('jev-policy-v1')
    expect(permitted('routing', .89)).toBe(false)
    expect(permitted('routing', .90)).toBe(true)
    expect(permitted('agent', .96)).toBe(false)
    expect(permitted('agent', .97)).toBe(true)
    expect(permitted('context', NaN)).toBe(false)
  })
  it('estimates model-specific token pricing', () => {
    const cost = estimateCandidateCost({ provider: 'openai', model: 'gpt-4o-mini', description: '' }, 1000, 1000)
    expect(cost.precision).toBe('model')
    expect(cost.usd).toBeGreaterThan(0)
  })
  it('blocks disabled provider candidates and duplicate models', () => {
    const input = routingSchema.parse({ task: 'Help write code', candidates: [
      { provider: 'deepseek', model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
      { provider: 'openai', model: 'gpt-4o' },
    ] })
    expect(eligibleCandidates(input).map(x => x.provider)).toEqual(['openai'])
    expect(() => eligibleCandidates({ ...input, candidates: [input.candidates[1], input.candidates[1]] })).toThrow('Duplicate')
  })
  it('rejects invalid context and agent actions', () => {
    expect(contextSchema.safeParse({ goal: '', items: [] }).success).toBe(false)
    expect(agentSchema.safeParse({ state: 'x', actions: [{ id: 'bad space', description: 'something' }, { id: 'ok', description: 'other' }] }).success).toBe(false)
  })
})
