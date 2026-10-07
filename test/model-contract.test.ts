import { describe, expect, it } from 'vitest'
import { validateModelRequest } from '@/lib/model-contract'
import { getContextWindowLimit } from '@/lib/token-counter'
import { parseLlmInput } from '@/lib/llm-request'

const request = { model: 'gpt-4o', messages: [{ role: 'user' as const, content: 'Hello' }] }
describe('server model contracts', () => {
  it('reserves output space and rejects over-budget conversations without truncation', () => {
    expect(() => validateModelRequest('openai', { ...request, model: 'gpt-4', messages: [{ role: 'user', content: 'a'.repeat(5000) }] })).toThrow(/context budget/)
    expect(() => validateModelRequest('openai', { ...request, max_tokens: 500 })).not.toThrow()
  })
  it('accounts for UTF-8 bytes instead of undercounting multilingual prompts', () => {
    expect(() => validateModelRequest('openai', { ...request, model: 'gpt-4', messages: [{ role: 'user', content: '界'.repeat(2000) }] })).toThrow(/context budget/)
  })
  it('uses catalog limits, recognizes dated versions, and bounds unknown models', () => {
    expect(getContextWindowLimit('openai', 'gpt-4o-2024-08-06')).toBe(128000)
    expect(getContextWindowLimit('openai', 'fake-gpt-4o')).toBe(8192)
    expect(getContextWindowLimit('googleai', 'gemini-2.0-flash')).toBe(1048576)
  })
  it('rejects unsupported advanced capabilities rather than silently dropping them', () => {
    expect(() => parseLlmInput({ ...request, provider: 'openai', tools: [] })).toThrow(/not supported/)
    expect(() => validateModelRequest('googleai', { ...request, reasoning_effort: 'high' })).toThrow(/reasoning/)
    expect(() => validateModelRequest('openai', { ...request, model: 'o3-mini', reasoning_effort: 'max' })).toThrow(/reasoning/)
  })
  it('validates provider-specific temperature limits', () => {
    expect(() => validateModelRequest('anthropic', { ...request, temperature: 1.8 })).toThrow(/temperature/)
    expect(() => validateModelRequest('anthropic', { ...request, model: 'claude-opus-5', temperature: 0.7 })).toThrow(/temperature/)
    expect(() => validateModelRequest('anthropic', { ...request, model: 'claude-opus-5' })).not.toThrow()
  })
})
