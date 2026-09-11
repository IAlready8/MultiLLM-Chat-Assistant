import { describe, expect, it } from 'vitest'
import { parseGenerationInput, parseLlmInput, readBoundedJson, usesServerHistory } from '@/lib/llm-request'
import { classifyProviderError } from '@/lib/providers'

const valid = { provider: 'openai', messages: [{ role: 'user', content: 'hello' }] }

describe('LLM input boundary', () => {
  it.each([null, [], 'prompt', 42, { ...valid, messages: [null] }, { ...valid, messages: [{ role: 'tool', content: 'x' }] }, { ...valid, messages: [{ role: 'user', content: {} }] }, { ...valid, temperature: 3 }, { ...valid, max_tokens: -1 }, { ...valid, model: {} }, { ...valid, stream: 'true' }, { ...valid, messages: Array(201).fill(valid.messages[0]) }])('rejects malformed input %#', value => {
    expect(() => parseLlmInput(value)).toThrow()
  })
  it('normalizes provider and retains supported generation settings', () => {
    expect(parseLlmInput({ ...valid, provider: ' OpenAI ', temperature: 0.2, max_tokens: 80 })).toMatchObject({ provider: 'openai', temperature: 0.2, max_tokens: 80 })
  })
  it('checks actual bytes even when Content-Length is absent', async () => {
    const request = new Request('http://localhost', { method: 'POST', body: JSON.stringify(valid) })
    await expect(readBoundedJson(request, 10)).rejects.toMatchObject({ status: 413, code: 'REQUEST_TOO_LARGE' })
  })
  it('rejects truncated JSON deterministically', async () => {
    await expect(readBoundedJson(new Request('http://localhost', { method: 'POST', body: '{' }))).rejects.toMatchObject({ code: 'INVALID_JSON' })
  })
  it('accepts a saved server-history generation and reports its mode', () => {
    const request = { provider: 'OpenAI', model: 'gpt-test', history: 'server', conversationId: 'conversation', requestId: '00000000-0000-4000-8000-000000000001', turnId: '00000000-0000-4000-8000-000000000002', instanceId: 'model-a', position: 0 }
    const parsed = parseGenerationInput(request)
    expect(usesServerHistory(parsed)).toBe(true)
    expect(parsed).toMatchObject({ provider: 'openai', model: 'gpt-test', conversationId: 'conversation' })
    expect(usesServerHistory(parseGenerationInput({ ...valid, history: 'client' }))).toBe(false)
  })
  it('rejects server history that also sends browser messages or omits saved identities', () => {
    const request = { provider: 'openai', model: 'gpt-test', history: 'server', conversationId: 'conversation', requestId: '00000000-0000-4000-8000-000000000001', turnId: '00000000-0000-4000-8000-000000000002' }
    expect(() => parseGenerationInput({ ...request, messages: valid.messages })).toThrow(/Omit messages/)
    for (const key of ['model', 'conversationId', 'requestId', 'turnId']) {
      const { [key]: _removed, ...rest } = request as Record<string, unknown>
      void _removed
      expect(() => parseGenerationInput(rest)).toThrow(/Server-assembled history requires/)
    }
    expect(() => parseGenerationInput({ ...request, tools: [] })).toThrow(/not supported/)
  })
  it('keeps server history out of the unsaved chat endpoint', () => {
    expect(() => parseLlmInput({ ...valid, history: 'server' })).toThrow(/only available for saved streaming/)
  })
  it('never returns upstream credentials, SQL, or request bodies in errors', () => {
    for (const message of ['HTTP 400: Bearer sk-secret-value', 'postgresql://user:password@host/db']) {
      expect(JSON.stringify(classifyProviderError(new Error(message)))).not.toContain(message)
    }
  })
})
