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
    const prismaMock: PrismaMock = {
      analytics: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'db-1',
            event: 'llm_request',
            payload: JSON.stringify({ provider: 'anthropic', tokens: 42 }),
            createdAt: new Date('2026-02-01T10:00:00.000Z'),
            userId: 'user-1',
          },
        ]),
      },
    }

    ;(
      globalThis as {
        __multiLlmAnalyticsFallbackStore?: Map<string, unknown[]>
      }
    ).__multiLlmAnalyticsFallbackStore = new Map([
      [
        'user-1',
        [
          {
            id: 'mem-1',
            event: 'llm_error',
            payload: JSON.stringify({ provider: 'openai' }),
            createdAt: new Date('2026-02-01T10:01:00.000Z'),
            userId: 'user-1',
          },
        ],
      ],
    ])

    const { getParsedAnalyticsEvents } = await loadServiceWithPrismaMock(prismaMock)

    const events = await getParsedAnalyticsEvents('user-1', 30)
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('llm_request')
    expect(events[1].event).toBe('llm_error')
    expect(events[0].payload.provider).toBe('anthropic')
    expect(events[1].payload.provider).toBe('openai')
  })
})
