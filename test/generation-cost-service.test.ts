import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type GenerationRow = {
  status: string
  promptTokens: number
  completionTokens: number
  usageSource: string
  message?: { provider: string | null; model: string | null } | null
}

type PrismaMock = {
  generation: { findMany: ReturnType<typeof vi.fn> }
}

const mockWarn = vi.fn()

const loadService = async (findMany: ReturnType<typeof vi.fn>) => {
  const prismaMock: PrismaMock = { generation: { findMany } }
  vi.doMock('@/lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }))
  vi.doMock('@/lib/logger', () => ({
    logger: { warn: mockWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }))
  const mod = await import('@/services/generation-cost-service')
  return { ...mod, prismaMock }
}

const row = (overrides: Partial<GenerationRow> = {}): GenerationRow => ({
  status: 'complete',
  promptTokens: 1_000_000,
  completionTokens: 1_000_000,
  usageSource: 'provider',
  message: { provider: 'openai', model: 'gpt-4o' },
  ...overrides,
})

beforeEach(() => {
  vi.resetModules()
  mockWarn.mockClear()
})

afterEach(() => {
  vi.doUnmock('@/lib/prisma')
  vi.doUnmock('@/lib/logger')
})

describe('getGenerationCostSummary', () => {
  it('prices recorded tokens per model with input and output split', async () => {
    const findMany = vi.fn().mockResolvedValue([row()])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.generations).toBe(1)
    expect(summary.promptTokens).toBe(1_000_000)
    expect(summary.completionTokens).toBe(1_000_000)
    expect(summary.inputUsd).toBe(2.5)
    expect(summary.outputUsd).toBe(10)
    expect(summary.totalUsd).toBe(12.5)
    expect(summary.empty).toBe(false)
    expect(summary.degraded).toBe(false)
    expect(summary.rows).toHaveLength(1)
    expect(summary.rows[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      precision: 'model',
      providerReportedShare: 1,
    })
  })

  it('scopes the query to the user, the window and billable statuses', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const { getGenerationCostSummary } = await loadService(findMany)

    await getGenerationCostSummary('user-1', 30)

    const args = findMany.mock.calls[0][0]
    expect(args.where.userId).toBe('user-1')
    expect(args.where.createdAt.gte).toBeInstanceOf(Date)
    expect(args.where.status.in).toEqual(
      expect.arrayContaining(['complete', 'failed', 'canceled', 'interrupted']),
    )
    // A bounded scan: the cap plus one probe row to detect truncation.
    expect(args.take).toBe(5_001)
  })

  it('groups by provider and model and orders by spend', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({ message: { provider: 'openai', model: 'gpt-4o-mini' } }),
      row({ message: { provider: 'openai', model: 'gpt-4o' } }),
      row({ message: { provider: 'openai', model: 'gpt-4o' } }),
      row({ message: { provider: 'anthropic', model: 'claude-sonnet-5' } }),
    ])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.rows).toHaveLength(3)
    // Ordered by recorded spend: two gpt-4o runs at $12.50 each outrank a
    // single Sonnet run at $18.00, which outranks the mini run at $0.75.
    expect(summary.rows.map(entry => entry.model)).toEqual([
      'gpt-4o',
      'claude-sonnet-5',
      'gpt-4o-mini',
    ])
    expect(summary.rows.map(entry => entry.totalUsd)).toEqual([25, 18, 0.75])
    expect(summary.rows[0].generations).toBe(2)
    expect(summary.generations).toBe(4)
  })

  it('totals equal the sum of their rows', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({ message: { provider: 'openai', model: 'gpt-4o' } }),
      row({ message: { provider: 'anthropic', model: 'claude-sonnet-5' } }),
      row({ message: { provider: 'googleai', model: 'gemini-1.5-flash' } }),
    ])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)
    const rowTotal = summary.rows.reduce((sum, entry) => sum + entry.totalUsd, 0)

    expect(summary.totalUsd).toBeCloseTo(rowTotal, 6)
    expect(summary.totalUsd).toBeCloseTo(summary.inputUsd + summary.outputUsd, 6)
  })

  it('reports an empty window without claiming a failure', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.empty).toBe(true)
    expect(summary.degraded).toBe(false)
    expect(summary.totalUsd).toBe(0)
    expect(summary.rows).toEqual([])
  })

  it('degrades to zeroes without throwing when the query fails', async () => {
    const findMany = vi.fn().mockRejectedValue(new Error('connection refused'))
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.degraded).toBe(true)
    // Not `empty`: a read failure must never be presented as a real zero.
    expect(summary.empty).toBe(false)
    expect(summary.totalUsd).toBe(0)
    expect(mockWarn).toHaveBeenCalledWith(
      'generation_cost_summary_degraded',
      expect.objectContaining({ windowDays: 7 }),
    )
  })

  it('flags a truncated window when the row cap is exceeded', async () => {
    const { MAX_GENERATION_COST_ROWS } = await import(
      '@/services/generation-cost-service'
    )
    vi.resetModules()
    const findMany = vi
      .fn()
      .mockResolvedValue(
        Array.from({ length: MAX_GENERATION_COST_ROWS + 1 }, () =>
          row({ promptTokens: 1_000, completionTokens: 1_000 }),
        ),
      )
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.truncated).toBe(true)
    expect(summary.generations).toBe(MAX_GENERATION_COST_ROWS)
  })

  it('reports the provider-reported share of counted tokens', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({ promptTokens: 500, completionTokens: 500, usageSource: 'provider' }),
      row({ promptTokens: 500, completionTokens: 500, usageSource: 'estimated' }),
    ])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.providerReportedShare).toBe(0.5)
  })

  it('counts a failed or canceled generation, which the provider may still bill', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({ status: 'failed', promptTokens: 1_000_000, completionTokens: 0 }),
      row({ status: 'canceled', promptTokens: 1_000_000, completionTokens: 0 }),
    ])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.generations).toBe(2)
    expect(summary.inputUsd).toBe(5)
  })

  it('labels a missing provider or model instead of dropping the spend', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([row({ message: { provider: null, model: null } })])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.rows[0]).toMatchObject({
      provider: 'unknown',
      model: 'unknown',
      precision: 'provider-fallback',
    })
    expect(summary.totalUsd).toBeGreaterThan(0)
  })

  it('tolerates a null message relation', async () => {
    const findMany = vi.fn().mockResolvedValue([row({ message: null })])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.rows[0].provider).toBe('unknown')
    expect(Number.isFinite(summary.totalUsd)).toBe(true)
  })

  it('sanitises hostile stored token counts', async () => {
    const findMany = vi.fn().mockResolvedValue([
      row({ promptTokens: -1_000, completionTokens: Number.NaN }),
    ])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.promptTokens).toBe(0)
    expect(summary.completionTokens).toBe(0)
    expect(summary.totalUsd).toBe(0)
    expect(summary.providerReportedShare).toBe(0)
  })

  it('normalises a non-positive window to a sane default', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 0)

    expect(summary.windowDays).toBe(7)
  })

  it('prices local Ollama generations at zero', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([row({ message: { provider: 'ollama', model: 'llama3' } })])
    const { getGenerationCostSummary } = await loadService(findMany)

    const summary = await getGenerationCostSummary('user-1', 7)

    expect(summary.totalUsd).toBe(0)
    expect(summary.generations).toBe(1)
  })
})
