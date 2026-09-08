import { describe, expect, it, vi } from 'vitest'
import { parseSSEStream } from '@/lib/providers/util'
import { readChatStream } from '@/services/stream-client'
import { ollamaAdapter } from '@/lib/providers/ollama'

const stream = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close() } })
const collect = async (source: AsyncIterable<string>) => { let result = ''; for await (const chunk of source) result += chunk; return result }
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

describe('upstream stream completion contract', () => {
  it('decodes fragmented, multiline SSE and retains final usage after the finish reason', async () => {
    const usage = vi.fn()
    const source = stream('data: {"choices":\r\ndata: [{"delta":{"content":"hel', 'lo"}}]}\r\n\r\n', 'data: {"choices":[{"finish_reason":"stop"}]}\n\n', 'data: {"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18}}\n\n', 'data: [DONE]\n\n')
    expect(await collect(parseSSEStream(source, frame => frame.choices?.[0]?.delta?.content, usage))).toBe('hello')
    expect(usage).toHaveBeenCalledWith({ prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 })
  })

  it('requires an upstream completion marker even if some content arrived', async () => {
    const chunks: string[] = []
    await expect((async () => { for await (const chunk of parseSSEStream(stream(delta('partial')), frame => frame.choices?.[0]?.delta?.content)) chunks.push(chunk) })()).rejects.toMatchObject({ code: 'PROVIDER_STREAM_INTERRUPTED' })
    expect(chunks).toEqual(['partial'])
  })

  it.each(['data: invalid\n\n', 'data: null\n\n', 'data: {"choices":[{"delta":{"content":42}}]}\n\n'])('rejects malformed upstream data', async body => {
    await expect(collect(parseSSEStream(stream(body), frame => frame.choices?.[0]?.delta?.content))).rejects.toBeInstanceOf(SyntaxError)
  })

  it('fails on an in-band provider error without exposing its private payload', async () => {
    const source = stream(delta('partial'), 'event: error\ndata: {"type":"error","error":{"message":"secret-upstream-detail"}}\n\n')
    await expect(collect(parseSSEStream(source, frame => frame.choices?.[0]?.delta?.content))).rejects.toMatchObject({ message: 'Provider stream failed', code: 'PROVIDER_UNAVAILABLE' })
  })

  it.each([
    ['anthropic', 'data: {"type":"message_stop"}\n\n'],
    ['googleai', 'data: {"candidates":[{"finishReason":"STOP"}]}\n\n'],
  ])('recognizes the %s terminal event', async (_provider, terminal) => {
    expect(await collect(parseSSEStream(stream(delta('ok'), terminal), frame => frame.choices?.[0]?.delta?.content))).toBe('ok')
  })

  it('cancels and releases an upstream reader when the consumer stops', async () => {
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(delta('one'))) }, cancel })
    const reader = parseSSEStream(source, frame => frame.choices?.[0]?.delta?.content)
    await reader.next()
    await reader.return()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(source.locked).toBe(false)
  })

  it('normalizes Ollama final usage and rejects a premature EOF', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const onUsage = vi.fn()
    try {
      fetch.mockResolvedValueOnce(new Response(stream('{"message":{"content":"local"},"done":false}\n', '{"done":true,"prompt_eval_count":12,"eval_count":4}\n')))
      expect(await collect(ollamaAdapter.stream({ messages: [{ role: 'user', content: 'Hi' }], onUsage }, { apiKey: '', baseUrl: 'http://localhost:11434' }))).toBe('local')
      expect(onUsage).toHaveBeenCalledWith({ prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 })
      fetch.mockResolvedValueOnce(new Response(stream('{"message":{"content":"partial"},"done":false}\n')))
      await expect(collect(ollamaAdapter.stream({ messages: [{ role: 'user', content: 'Hi' }] }, { apiKey: '', baseUrl: 'http://localhost:11434' }))).rejects.toMatchObject({ code: 'PROVIDER_STREAM_INTERRUPTED' })
    } finally { fetch.mockRestore() }
  })
})

describe('browser stream completion contract', () => {
  it('rejects a truncated stream and preserves delivered content', async () => {
    const chunk = vi.fn()
    await expect(readChatStream(new Response(stream('{"type":"chunk","content":"partial"}\n')), chunk)).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })
    expect(chunk).toHaveBeenCalledWith('partial')
  })
  it.each(['not json\n', '{"type":"unknown"}\n', '{"type":"chunk","content":42}\n', 'null\n'])('rejects malformed downstream events', async body => {
    await expect(readChatStream(new Response(stream(body)), () => {})).rejects.toThrow()
  })
  it('rejects empty success', async () => {
    await expect(readChatStream(new Response(stream('{"type":"done"}\n')), () => {})).rejects.toMatchObject({ code: 'PROVIDER_EMPTY_RESPONSE' })
  })
  it('aborts a pending read and releases the connection', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const source = new ReadableStream<Uint8Array>({ cancel })
    const pending = readChatStream(new Response(source), () => {}, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(source.locked).toBe(false)
  })
})
