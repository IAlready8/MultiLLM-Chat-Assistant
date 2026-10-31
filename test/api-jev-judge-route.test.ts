import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  limit: vi.fn(),
  findConfig: vi.fn(),
  userKey: vi.fn(),
  choose: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: () => mocks.auth() }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('@/lib/prisma', () => ({
  default: { providerConfig: { findUnique: (args: unknown) => mocks.findConfig(args) } },
}))
vi.mock('@/lib/api-key-service', () => ({
  getUserApiKey: (userId: string, provider: string) => mocks.userKey(userId, provider),
}))
vi.mock('@/lib/jev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jev')>()),
  jevChoose: mocks.choose,
}))

import { POST } from '@/app/api/jev/judge/route'
import { JevError } from '@/lib/jev'

const validBody = {
  state: 'Write a launch email',
  options: [
    { id: 'm1', label: 'Agent A', content: 'First draft' },
    { id: 'm2', label: 'Agent B', content: 'Second draft' },
  ],
}

const jsonRequest = (body: unknown) =>
  new Request('http://localhost/api/jev/judge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const enabledConfig = {
  provider: 'jev',
  isActive: true,
  settings: JSON.stringify({ jevJudgingEnabled: true }),
}

describe('POST /api/jev/judge', () => {
  const originalServerKey = process.env.JEV_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.JEV_API_KEY
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.limit.mockResolvedValue({ allowed: true })
    mocks.findConfig.mockResolvedValue(enabledConfig)
    mocks.userKey.mockResolvedValue('user-key')
    mocks.choose.mockResolvedValue({
      winnerId: 'm2',
      winnerLabel: 'Agent B',
      probabilities: { m1: 0.3, m2: 0.7 },
      confidence: 0.7,
      model: 'jev-1.13.0',
    })
    return () => {
      if (originalServerKey === undefined) delete process.env.JEV_API_KEY
      else process.env.JEV_API_KEY = originalServerKey
    }
  })

  it('forwards the authentication response', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const response = await POST(jsonRequest(validBody))

    expect(response.status).toBe(401)
    expect(mocks.limit).not.toHaveBeenCalled()
  })

  it('rate limits per user before reading the body', async () => {
    mocks.limit.mockResolvedValue({ allowed: false })

    const response = await POST(jsonRequest(validBody))

    expect(response.status).toBe(429)
    expect(mocks.limit).toHaveBeenCalledWith('jev-judge:user-1', { max: 20, windowMs: 60_000 })
    expect(mocks.findConfig).not.toHaveBeenCalled()
    expect(mocks.choose).not.toHaveBeenCalled()
  })

  it('rejects an oversized body with 413', async () => {
    const response = await POST(jsonRequest('x'.repeat(256_001)))

    expect(response.status).toBe(413)
    expect(mocks.choose).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON with 400', async () => {
    const response = await POST(jsonRequest('{not json'))

    expect(response.status).toBe(400)
  })

  it('rejects a request with fewer than two options', async () => {
    const response = await POST(jsonRequest({ ...validBody, options: [validBody.options[0]] }))

    expect(response.status).toBe(400)
    expect(mocks.choose).not.toHaveBeenCalled()
  })

  it('requires an existing, enabled and active configuration', async () => {
    mocks.findConfig.mockResolvedValueOnce(null)
    expect((await POST(jsonRequest(validBody))).status).toBe(400)

    mocks.findConfig.mockResolvedValueOnce({ ...enabledConfig, settings: JSON.stringify({ jevJudgingEnabled: false }) })
    expect((await POST(jsonRequest(validBody))).status).toBe(400)

    mocks.findConfig.mockResolvedValueOnce({ ...enabledConfig, isActive: false })
    expect((await POST(jsonRequest(validBody))).status).toBe(400)

    expect(mocks.choose).not.toHaveBeenCalled()
  })

  it('judges with the user key even when a server-wide key exists', async () => {
    process.env.JEV_API_KEY = 'server-key'

    const response = await POST(jsonRequest(validBody))

    expect(response.status).toBe(200)
    expect(mocks.choose).toHaveBeenCalledWith(
      'user-key',
      expect.objectContaining({
        question: 'Which response is the best?',
        options: [{ id: 'm1', label: 'Agent A' }, { id: 'm2', label: 'Agent B' }],
        contents: { m1: 'First draft', m2: 'Second draft' },
      }),
      expect.anything(),
    )
    await expect(response.json()).resolves.toEqual({
      winnerId: 'm2',
      winnerLabel: 'Agent B',
      probabilities: { m1: 0.3, m2: 0.7 },
      confidence: 0.7,
      judgedBy: 'jev',
      model: 'jev-1.13.0',
    })
  })

  it('falls back to the server-wide key when the user has none', async () => {
    process.env.JEV_API_KEY = 'server-key'
    mocks.userKey.mockResolvedValue(null)

    expect((await POST(jsonRequest(validBody))).status).toBe(200)
    expect(mocks.choose).toHaveBeenCalledWith('server-key', expect.anything(), expect.anything())
  })

  it('returns 400 when no key is available at all', async () => {
    mocks.userKey.mockResolvedValue(null)

    expect((await POST(jsonRequest(validBody))).status).toBe(400)
    expect(mocks.choose).not.toHaveBeenCalled()
  })

  it.each([401, 403])('reports an upstream %i key rejection as 502, never as a session 401', async (status) => {
    mocks.choose.mockRejectedValue(new JevError('Jev rejected the configured API key', 'JEV_AUTH_FAILED', status))

    const response = await POST(jsonRequest(validBody))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'Jev rejected the configured API key',
      code: 'JEV_AUTH_FAILED',
    })
  })

  it('passes upstream rate limiting through as 429', async () => {
    mocks.choose.mockRejectedValue(new JevError('Jev rate limited, try again shortly', 'JEV_RATE_LIMITED', 429))

    expect((await POST(jsonRequest(validBody))).status).toBe(429)
  })

  it('reports an unexpected failure as 502 without details', async () => {
    mocks.choose.mockRejectedValue(new Error('socket hang up'))

    const response = await POST(jsonRequest(validBody))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'Jev judging failed' })
  })
})
