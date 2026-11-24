import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getJevApiKey, jevChoose, JevError, JEV_JUDGE_MODEL } from '@/lib/jev'
import { JEV_ENDPOINT } from '@/lib/decision/jev'

const judgeRequest = {
  state: 'Write a launch email',
  question: 'Which agent response is the best?',
  options: [
    { id: 'm1', label: 'Agent A' },
    { id: 'm2', label: 'Agent B' },
  ],
  contents: { m1: 'First draft', m2: 'Second draft' },
}

const okResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
})

describe('Jev judging client', () => {
  const originalServerKey = process.env.JEV_API_KEY

  beforeEach(() => {
    delete process.env.JEV_API_KEY
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalServerKey === undefined) delete process.env.JEV_API_KEY
    else process.env.JEV_API_KEY = originalServerKey
  })

  it('sends the documented choice-question shape to the fixed endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({
      model: 'jev-1.13.0',
      answers: { best_response: { type: 'choice', choice: 'm2', confidence: 0.8, probabilities: { m1: 0.2, m2: 0.8 } } },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await jevChoose('user-key', judgeRequest)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(JEV_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    expect(init.headers.Authorization).toBe('Bearer user-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe(JEV_JUDGE_MODEL)
    expect(Array.isArray(body.questions)).toBe(false)
    expect(body.questions.best_response).toEqual({
      type: 'choice',
      instructions: 'Which agent response is the best?',
      criteria: { m1: 'Agent A', m2: 'Agent B' },
    })
    expect(body.state).toContain('--- Agent A ---')
    expect(body.state).toContain('Second draft')
  })

  it('returns the winner, its probabilities, confidence and the answering model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({
      model: 'jev-1.13.0',
      answers: { best_response: { type: 'choice', choice: 'm2', confidence: 0.8, probabilities: { m1: 0.2, m2: 0.8 } } },
    })))

    await expect(jevChoose('user-key', judgeRequest)).resolves.toEqual({
      winnerId: 'm2',
      winnerLabel: 'Agent B',
      probabilities: { m1: 0.2, m2: 0.8 },
      confidence: 0.8,
      model: 'jev-1.13.0',
    })
  })

  it('truncates very long responses in the judged state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({
      answers: { best_response: { choice: 'm1', confidence: 0.6 } },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await jevChoose('user-key', { ...judgeRequest, contents: { m1: 'x'.repeat(5000), m2: 'short' } })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.state).toContain('...[truncated]')
    expect(body.state).not.toContain('x'.repeat(2001))
  })

  it('rejects a choice outside the offered options', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({
      answers: { best_response: { choice: 'm9', confidence: 0.9 } },
    })))

    await expect(jevChoose('user-key', judgeRequest)).rejects.toMatchObject({
      name: 'JevError',
      code: 'JEV_INVALID_RESPONSE',
    })
  })

  it('rejects a malformed answer instead of defaulting confidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({
      answers: { best_response: { choice: 'm1' } },
    })))

    await expect(jevChoose('user-key', judgeRequest)).rejects.toMatchObject({ code: 'JEV_INVALID_RESPONSE' })
  })

  it('rejects an oversized response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'x'.repeat(100_001),
    }))

    await expect(jevChoose('user-key', judgeRequest)).rejects.toMatchObject({ code: 'JEV_INVALID_RESPONSE' })
  })

  it.each([
    [401, 'JEV_AUTH_FAILED'],
    [403, 'JEV_AUTH_FAILED'],
    [402, 'JEV_QUOTA_EXCEEDED'],
    [429, 'JEV_RATE_LIMITED'],
    [500, 'JEV_API_ERROR'],
  ])('maps upstream HTTP %i to %s', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, text: async () => '' }))

    const error = await jevChoose('user-key', judgeRequest).catch((caught) => caught)

    expect(error).toBeInstanceOf(JevError)
    expect(error.code).toBe(code)
    expect(error.statusCode).toBe(status)
  })

  it('reports a timeout without leaking internals', async () => {
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

    await expect(jevChoose('user-key', judgeRequest)).rejects.toMatchObject({ code: 'JEV_TIMEOUT' })
  })

  describe('getJevApiKey', () => {
    it('prefers the user key over a server-wide key', () => {
      process.env.JEV_API_KEY = 'server-key'
      expect(getJevApiKey(' user-key ')).toBe('user-key')
    })

    it('falls back to the server-wide key when the user has none', () => {
      process.env.JEV_API_KEY = 'server-key'
      expect(getJevApiKey(null)).toBe('server-key')
      expect(getJevApiKey('   ')).toBe('server-key')
    })

    it('returns null when neither key exists', () => {
      expect(getJevApiKey(undefined)).toBeNull()
    })
  })
})
