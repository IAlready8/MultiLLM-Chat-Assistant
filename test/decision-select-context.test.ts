import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  evaluate: vi.fn(),
  record: vi.fn(),
}))

vi.mock('@/lib/decision/jev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/decision/jev')>()),
  evaluateJevChoice: mocks.evaluate,
}))
vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: mocks.record,
  getParsedAnalyticsEvents: vi.fn().mockResolvedValue([]),
}))

import { CONTEXT_CONCURRENCY, selectContext } from '@/lib/decision/control-plane'

const keepVerdict = { choice: 'keep', confidence: 0.95, model: 'jev-latest', latencyMs: 5 }
const dropVerdict = { choice: 'drop', confidence: 0.95, model: 'jev-latest', latencyMs: 5 }

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const candidateOf = (input: { state: string }) => input.state.split('\nCandidate: ')[1]

describe('selectContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.record.mockResolvedValue(undefined)
  })

  it('scores at most CONTEXT_CONCURRENCY items at a time', async () => {
    let active = 0
    let peak = 0
    mocks.evaluate.mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return keepVerdict
    })
    const items = Array.from({ length: 12 }, (_, i) => ({ id: 'i' + i, text: 'item ' + i }))

    const result = await selectContext('user-1', { goal: 'g', items, maxCharacters: 100_000 })

    expect(CONTEXT_CONCURRENCY).toBe(4)
    expect(mocks.evaluate).toHaveBeenCalledTimes(12)
    expect(peak).toBe(CONTEXT_CONCURRENCY)
    expect(result.items.map((item) => item.id)).toEqual(items.map((item) => item.id))
  })

  it('admits kept items in the caller order even when verdicts arrive out of order', async () => {
    const pending = new Map<string, ReturnType<typeof deferred<typeof keepVerdict>>>()
    mocks.evaluate.mockImplementation((input: { state: string }) => {
      const d = deferred<typeof keepVerdict>()
      pending.set(candidateOf(input), d)
      return d.promise
    })
    const items = [
      { id: 'a', text: 'alpha' },
      { id: 'b', text: 'bravo' },
      { id: 'c', text: 'charlie' },
    ]

    const run = selectContext('user-1', { goal: 'g', items, maxCharacters: 1000 })
    await vi.waitFor(() => expect(pending.size).toBe(3))
    pending.get('charlie')!.resolve(keepVerdict)
    pending.get('bravo')!.resolve(dropVerdict)
    pending.get('alpha')!.resolve(keepVerdict)
    const result = await run

    expect(result.items.map((item) => item.id)).toEqual(['a', 'c'])
    expect(result.rewritten).toBe(false)
    expect(result.items[1].text).toBe('charlie')
  })

  it('stays within the character budget and never scores items larger than the budget', async () => {
    mocks.evaluate.mockResolvedValue(keepVerdict)
    const items = [
      { id: 'big', text: 'x'.repeat(150) },
      { id: 'first', text: 'y'.repeat(60) },
      { id: 'second', text: 'z'.repeat(60) },
      { id: 'third', text: 'w'.repeat(30) },
    ]

    const result = await selectContext('user-1', { goal: 'g', items, maxCharacters: 100 })

    expect(mocks.evaluate).toHaveBeenCalledTimes(3)
    expect(result.items.map((item) => item.id)).toEqual(['first', 'third'])
    expect(result.remainingCharacters).toBe(10)
  })

  it('drops items below the context confidence threshold', async () => {
    mocks.evaluate
      .mockResolvedValueOnce({ ...keepVerdict, confidence: 0.84 })
      .mockResolvedValueOnce(keepVerdict)
    const items = [{ id: 'low', text: 'low' }, { id: 'high', text: 'high' }]

    const result = await selectContext('user-1', { goal: 'g', items, maxCharacters: 1000 })

    expect(result.items.map((item) => item.id)).toEqual(['high'])
  })

  it('stops starting new evaluations after the first failure, aborts in-flight ones and records nothing', async () => {
    const signals: AbortSignal[] = []
    mocks.evaluate.mockImplementation((input: { state: string }, signal: AbortSignal) => {
      signals.push(signal)
      if (candidateOf(input) === 'item 0') return Promise.reject(new Error('Jev returned HTTP 500'))
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
    })
    const items = Array.from({ length: 10 }, (_, i) => ({ id: 'i' + i, text: 'item ' + i }))

    await expect(selectContext('user-1', { goal: 'g', items, maxCharacters: 100_000 }))
      .rejects.toThrow('Jev returned HTTP 500')

    expect(mocks.evaluate).toHaveBeenCalledTimes(CONTEXT_CONCURRENCY)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('passes caller cancellation through to every evaluation', async () => {
    const caller = new AbortController()
    mocks.evaluate.mockImplementation((_input: unknown, signal: AbortSignal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      }))
    const items = [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }]

    const run = selectContext('user-1', { goal: 'g', items, maxCharacters: 1000 }, caller.signal)
    await vi.waitFor(() => expect(mocks.evaluate).toHaveBeenCalledTimes(2))
    caller.abort()

    await expect(run).rejects.toThrow('cancelled')
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('records one decision event with the retained ids', async () => {
    mocks.evaluate.mockResolvedValueOnce(keepVerdict).mockResolvedValueOnce(dropVerdict)

    await selectContext('user-1', { goal: 'g', items: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], maxCharacters: 1000 })

    expect(mocks.record).toHaveBeenCalledTimes(1)
    expect(mocks.record.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      event: 'jev_decision_v2',
      payload: expect.objectContaining({ kind: 'context', retainedIds: ['a'], originalCount: 2, retainedCount: 1 }),
    })
  })
})
