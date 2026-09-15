// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), chat: vi.fn(), begin: vi.fn(), finish: vi.fn() }))
vi.mock('@/services/generation-service', () => ({ beginGeneration: mocks.begin, finishGeneration: mocks.finish }))
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/llm-runtime', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/llm-runtime')>(), executeChat: mocks.chat }))
import { POST } from '@/app/api/llm/orchestrate/route'

const input = { prompt: 'compare', requests: [{ provider: 'openai', model: 'model-a', prompt: 'hello' }] }
const request = (body: unknown = input, signal?: AbortSignal) => new Request('http://localhost/api/llm/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'sensitive-session', host: 'attacker.invalid', 'x-forwarded-proto': 'http' }, body: JSON.stringify(body), signal })
const answer = (content = 'answer') => ({ content, usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, usage_source: 'provider' } })

describe('native orchestration and explicit sidecar', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('PYTHON_CORE_URL', ''); vi.stubGlobal('fetch', vi.fn()); mocks.auth.mockResolvedValue({ user: { id: 'user-1' } }); mocks.chat.mockResolvedValue(answer()) })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('persists saved runs before completing and replays without dispatch', async () => {
    const saved = { ...input, conversationId: 'conversation', turnId: '00000000-0000-4000-8000-000000000001', requests: [{ ...input.requests[0], requestId: '00000000-0000-4000-8000-000000000002' }] }
    mocks.begin.mockResolvedValue({ id: 'generation', replay: null })
    mocks.finish.mockResolvedValue(undefined)
    const response = await POST(request(saved))
    expect(await response.json()).toMatchObject([{ status: 'complete' }])
    expect(mocks.finish).toHaveBeenCalledWith('user-1', 'generation', 'answer', 'complete', expect.any(Object))
    mocks.chat.mockClear()
    mocks.begin.mockResolvedValue({ id: 'generation', replay: 'saved answer' })
    expect(await (await POST(request(saved))).json()).toMatchObject([{ content: 'saved answer', replay: true }])
    expect(mocks.chat).not.toHaveBeenCalled()
  })

  it('forwards authentication failures without any provider dispatch', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await POST(request())).status).toBe(401)
    expect(mocks.chat).not.toHaveBeenCalled()
  })
  it('rejects invalid JSON', async () => {
    expect((await POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400)
  })
  it.each([null, {}, { ...input, requests: [] }, { ...input, requests: Array(9).fill(input.requests[0]) }, { ...input, prompt: 1 }, { ...input, requests: [{ provider: 'openai' }] }, { prompt: '', requests: [{ ...input.requests[0], prompt: '' }] }])('rejects invalid batch %# before dispatch', async value => {
    expect((await POST(request(value))).status).toBe(400)
    expect(mocks.chat).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['', 'ftp://attacker.invalid', 'https://user:password@attacker.invalid', 'https://attacker.invalid?secret=value', 'https://attacker.invalid#fragment'])('does not forward cookies to any app origin (%s)', async origin => {
    vi.stubEnv('NEXTAUTH_URL', origin)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.chat.mock.calls)).not.toContain('sensitive-session')
  })
  it('runs in Vercel preview without a loopback request or a production session forward', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const response = await POST(request())
    expect(response.headers.get('x-orchestration-fallback')).toBe('native')
    expect(mocks.chat.mock.calls[0][0]).toBe('user-1')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not invent provider-wide cost estimates', async () => {
    expect(await (await POST(request())).json()).toMatchObject([{ cost_usd: null, status: 'complete', usage_source: 'provider' }])
  })
  it('isolates a rejected provider and preserves attribution', async () => {
    mocks.chat.mockRejectedValueOnce(new Error('HTTP 429 secret-provider-body')).mockResolvedValueOnce(answer('survivor'))
    const response = await POST(request({ ...input, requests: [input.requests[0], { ...input.requests[0], provider: 'anthropic' }] }))
    expect(await response.json()).toMatchObject([{ provider: 'openai', status: 'failed', code: 'RATE_LIMITED', content: '' }, { provider: 'anthropic', status: 'complete', content: 'survivor' }])
  })
  it('limits concurrency to three and restores selection order after out-of-order completion', async () => {
    const releases: Array<() => void> = []
    mocks.chat.mockImplementation(async (_user, body) => { await new Promise<void>(resolve => { releases.push(resolve) }); return answer(body.model) })
    const pending = POST(request({ ...input, requests: Array.from({ length: 5 }, (_, i) => ({ ...input.requests[0], model: `model-${i}` })) }))
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalledTimes(3))
    releases[2](); releases[0](); releases[1]()
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalledTimes(5))
    releases[4](); releases[3]()
    expect((await (await pending).json()).map((item: { content: string }) => item.content)).toEqual(['model-0', 'model-1', 'model-2', 'model-3', 'model-4'])
  })
  it('propagates client cancellation and does not start queued provider work', async () => {
    const controller = new AbortController()
    mocks.chat.mockImplementation(async (_user, _body, signal: AbortSignal) => { await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); return answer() })
    const pending = POST(request({ ...input, requests: Array(5).fill(input.requests[0]) }, controller.signal))
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalledTimes(3))
    controller.abort()
    expect((await (await pending).json())).toHaveLength(5)
    expect(mocks.chat).toHaveBeenCalledTimes(3)
  })
  it.each([429, 500, 302])('does not redispatch possibly billable sidecar requests after HTTP %i', async status => {
    vi.stubEnv('PYTHON_CORE_URL', 'https://sidecar.example')
    vi.mocked(fetch).mockResolvedValue(new Response('upstream-secret', { status }))
    expect((await POST(request())).status).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(mocks.chat).not.toHaveBeenCalled()
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })
  it.each([new TypeError('fetch failed'), new Error('request timed out')])('does not redispatch after ambiguous sidecar failure %#', async error => {
    vi.stubEnv('PYTHON_CORE_URL', 'https://sidecar.example')
    vi.mocked(fetch).mockRejectedValue(error)
    expect((await POST(request())).status).toBeGreaterThanOrEqual(500)
    expect(mocks.chat).not.toHaveBeenCalled()
  })
  it('validates sidecar attribution and rejects malformed results', async () => {
    vi.stubEnv('PYTHON_CORE_URL', 'https://sidecar.example')
    vi.mocked(fetch).mockResolvedValue(Response.json([{ provider: 'wrong' }]))
    expect((await POST(request())).status).toBe(502)
  })
  it('accepts valid sidecar results without exposing the user session', async () => {
    vi.stubEnv('PYTHON_CORE_URL', 'https://sidecar.example')
    vi.mocked(fetch).mockResolvedValue(Response.json([{ provider: 'openai', model: 'model-a', content: 'answer', prompt_tokens: 1, completion_tokens: 2, cost_usd: null, latency_ms: 3 }]))
    expect((await POST(request())).status).toBe(200)
    expect(JSON.stringify(vi.mocked(fetch).mock.calls)).not.toContain('sensitive-session')
  })
})
