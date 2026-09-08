import { describe, expect, it } from 'vitest'
import { parseLlmInput, readBoundedJson } from '@/lib/llm-request'
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
  it('never returns upstream credentials, SQL, or request bodies in errors', () => {
    for (const message of ['HTTP 400: Bearer sk-secret-value', 'postgresql://user:password@host/db']) {
      expect(JSON.stringify(classifyProviderError(new Error(message)))).not.toContain(message)
    }
  })
})
