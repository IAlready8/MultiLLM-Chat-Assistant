import { beforeEach, describe, expect, it, vi } from 'vitest'

const DB_UNAVAILABLE_ERROR = new Error(
  'Database access for analytics is not available in this environment.'
)

type PrismaMock = {
  analytics: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}

const makePrismaMock = (): PrismaMock => ({
  analytics: {
    findMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    create: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
  },
})

const loadService = async () => {
  const prismaMock = makePrismaMock()
  vi.doMock('@/lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }))
  const mod = await import('@/services/analytics-service')
  return { ...mod, prismaMock }
}

const loadServiceWithPrismaMock = async (prismaMock: PrismaMock) => {
  vi.doMock('@/lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }))
  const mod = await import('@/services/analytics-service')
  return { ...mod, prismaMock }
}

describe('analytics-service DB fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __multiLlmAnalyticsFallbackStore?: unknown })
      .__multiLlmAnalyticsFallbackStore
  })

  it('records and reads analytics from in-memory fallback when DB is unavailable', async () => {
    const { recordAnalyticsEvent, getParsedAnalyticsEvents, getAnalytics } =
      await loadService()

    await recordAnalyticsEvent({
      event: 'llm_request',
      userId: 'user-1',
      payload: {
        provider: 'openai',
        content: 'Hello from fallback analytics',
        responseTime: 120,
      },
    })

    const parsed = await getParsedAnalyticsEvents('user-1', 7)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].payload.provider).toBe('openai')

    const usage = await getAnalytics('user-1')
    expect(usage).toHaveLength(1)
    expect(usage[0]).toMatchObject({
      provider: 'openai',
      requests: 1,
      errors: 0,
    })
    expect(usage[0].tokens).toBeGreaterThan(0)
  })

  it('merges database and fallback events when DB reads succeed', async () => {
    // Use a generic error that won't mark DB as permanently unavailable
    const TRANSIENT_ERROR = new Error('Transient write error')

    const prismaMock: PrismaMock = {
      analytics: {
        // Mock create to reject with a transient error - fallback will be used
        create: vi.fn().mockRejectedValue(TRANSIENT_ERROR),
        // Mock findMany to succeed - DB reads work fine
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'db-1',
            event: 'llm_request',
            payload: JSON.stringify({ provider: 'anthropic', tokens: 42 }),
            createdAt: new Date('2026-03-01T10:00:00.000Z'),
            userId: 'user-1',
          },
        ]),
      },
    }

    const { getParsedAnalyticsEvents, recordAnalyticsEvent } =
      await loadServiceWithPrismaMock(prismaMock)

    // Record an event - write will fail, event goes to fallback
    await recordAnalyticsEvent({
      event: 'llm_error',
      userId: 'user-1',
      payload: { provider: 'openai' },
      createdAt: new Date('2026-03-01T10:01:00.000Z'),
    })

    // Read events - DB reads succeed, should merge DB events with fallback events
    const events = await getParsedAnalyticsEvents('user-1', 30)
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('llm_request')
    expect(events[1].event).toBe('llm_error')
    expect(events[0].payload.provider).toBe('anthropic')
    expect(events[1].payload.provider).toBe('openai')
  })
})
