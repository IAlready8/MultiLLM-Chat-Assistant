import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decisionInputSchema, evaluateJevChoice } from './jev'

const request = {
  state: 'Fix a TypeScript error',
  candidates: [
    { id: 'openai', description: 'General debugging' },
    { id: 'anthropic', description: 'Long code reviews' },
  ],
}

describe('Jev decision adapter', () => {
  beforeEach(() => {
    process.env.JEV_SHADOW_ENABLED = 'true'
    process.env.TYPESAFE_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TYPESAFE_API_KEY
    delete process.env.JEV_SHADOW_ENABLED
  })
  it('rejects duplicate candidates', () => {
    const duplicated = { ...request, candidates: [request.candidates[0], request.candidates[0]] }
    expect(decisionInputSchema.safeParse(duplicated).success).toBe(false)
  })
  it('accepts a valid typed choice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        model: 'jev-1.13.0',
        answers: { route: { type: 'choice', choice: 'openai', confidence: 0.91 } },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await evaluateJevChoice(decisionInputSchema.parse(request))
    expect(result.choice).toBe('openai')
    expect(result.confidence).toBe(0.91)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.questions.route.criteria).toEqual({
      openai: 'General debugging',
      anthropic: 'Long code reviews',
    })
  })
  it('rejects unknown returned candidates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        answers: { route: { choice: 'unknown', confidence: 0.9 } },
      }),
    }))
    await expect(evaluateJevChoice(decisionInputSchema.parse(request))).rejects.toThrow('outside the allowed set')
  })
  it('fails closed when shadow mode is disabled', async () => {
    delete process.env.JEV_SHADOW_ENABLED
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(evaluateJevChoice(decisionInputSchema.parse(request))).rejects.toThrow('disabled')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
