import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ProviderRequest } from '@/lib/providers'
const mocks = vi.hoisted(() => ({ begin: vi.fn(), finish: vi.fn(), stream: vi.fn(), after: vi.fn() }))
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: mocks.after }))
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: async () => ({ user: { id: 'user' } }) }))
vi.mock('@/lib/api-key-service', () => ({ getUserApiKey: async () => 'sk-test-12345678901234567890', getUserProviderConfigs: async () => [{ provider: 'openai', settings: {} }] }))
vi.mock('@/lib/provider-rate-limit', () => ({ checkProviderRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/services/analytics-service', () => ({ recordAnalyticsEvent: vi.fn() }))
vi.mock('@/services/generation-service', () => ({ beginGeneration: mocks.begin, finishGeneration: mocks.finish, checkpointGeneration: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/providers', async original => ({ ...await original<typeof import('@/lib/providers')>(), getProviderAdapter: () => ({ stream: mocks.stream }) }))
import { POST } from '@/app/api/llm/stream/route'
const input = { provider: 'openai', messages: [{ role: 'user', content: 'hello' }], conversationId: 'conversation', requestId: '00000000-0000-4000-8000-000000000001', turnId: '00000000-0000-4000-8000-000000000002' }
const request = () => new NextRequest('http://localhost/api/llm/stream', { method: 'POST', body: JSON.stringify(input) })

describe('saved stream completion contract', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.begin.mockResolvedValue({ id: 'generation', replay: null })
    mocks.finish.mockResolvedValue(undefined)
    mocks.stream.mockImplementation(async function* () { yield 'answer' })
  })
  it('saves the response and usage before sending done', async () => {
    let release!: () => void
    mocks.finish.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
    const response = await POST(request())
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('answer')
    await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalled())
    let receivedDone = false
    const next = reader.read().then(value => { receivedDone = true; return value })
    await Promise.resolve()
    expect(receivedDone).toBe(false)
    release()
    expect(new TextDecoder().decode((await next).value)).toContain('"type":"done"')
    expect(mocks.finish).toHaveBeenCalledWith('user', 'generation', 'answer', 'complete', expect.objectContaining({ usage_source: 'estimated' }))
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })
  it('replays durable content without a provider call or usage write', async () => {
    mocks.begin.mockResolvedValue({ id: 'generation', replay: 'saved answer' })
    expect(await (await POST(request())).text()).toContain('saved answer')
    expect(mocks.stream).not.toHaveBeenCalled()
    expect(mocks.finish).not.toHaveBeenCalled()
  })
  it('does not report success if persistence fails', async () => {
    mocks.finish.mockRejectedValue(new Error('database unavailable'))
    const body = await (await POST(request())).text()
    expect(body).toContain('"type":"error"')
    expect(body).not.toContain('"type":"done"')
    expect(body).not.toContain('database unavailable')
  })
  it('cancels upstream work and saves partial content on disconnect', async () => {
    let signal!: AbortSignal
    mocks.stream.mockImplementation(async function* (request: ProviderRequest) {
      signal = request.signal!
      yield 'partial'
      signal.throwIfAborted()
      await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    const response = await POST(request())
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(signal.aborted).toBe(true)
    await vi.waitFor(() => expect(mocks.finish).toHaveBeenCalledWith('user', 'generation', 'partial', 'canceled', expect.any(Object)))
  })
})
