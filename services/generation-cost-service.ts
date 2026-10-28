/**
 * services/generation-cost-service.ts
 *
 * Cost aggregation over durable `Generation` rows.
 *
 * WHY NOT REUSE THE ANALYTICS EVENT STREAM
 * ----------------------------------------
 * `/api/analytics` derives its token totals from `Analytics` event payloads.
 * Those are best-effort telemetry: `recordLlmEvent` in `lib/llm-runtime.ts`
 * swallows its own failures by design (a dropped metric must never fail a
 * user's generation), and the analytics reader falls back to
 * `content.length / 4` when a payload carries no token fields at all. That is
 * acceptable for a usage chart and unacceptable as the basis of a spend
 * figure.
 *
 * The `Generation` table is the durable record of the same work. Every saved
 * generation writes `promptTokens`, `completionTokens` and `usageSource`
 * inside the same transaction that writes the assistant message
 * (`finishGeneration` in `services/generation-service.ts`), so the row either
 * exists with its token counts or the message does not exist either. That is
 * the correct source for cost.
 *
 * `usageSource` is carried through to the caller untouched, which is what
 * makes the resulting figure auditable: `provider` means the upstream reported
 * the counts, `estimated` means `resolveUsage` derived them from character
 * length. A cost built mostly from estimated counts is a weaker number and the
 * UI says so rather than hiding the distinction.
 *
 * BOUNDED SCAN
 * ------------
 * Rows are read newest-first under a hard cap and aggregated in process. A
 * grouped aggregate cannot be pushed into one Prisma query here because the
 * provider and model live on the related `Message` row, not on `Generation`.
 * When the cap is reached the result is flagged `truncated` so the surface can
 * label the figure a partial window instead of quietly under-reporting. The
 * follow-up, if histories outgrow the cap, is to denormalise provider/model
 * onto `Generation` and group in SQL; that is a schema change and is
 * deliberately not bundled here.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  estimateModelCost,
  MODEL_COST_BASIS,
  type CostPrecision,
} from '@/lib/model-pricing'

/** Hard ceiling on rows read for one cost window. */
export const MAX_GENERATION_COST_ROWS = 5_000

/** Generation statuses that represent billable provider work. */
const BILLABLE_STATUSES = ['complete', 'failed', 'canceled', 'interrupted']

export interface ModelCostRow {
  provider: string
  model: string
  generations: number
  promptTokens: number
  completionTokens: number
  inputUsd: number
  outputUsd: number
  totalUsd: number
  /** `model` when an exact published rate matched, else `provider-fallback`. */
  precision: CostPrecision
  /** Share of this row's tokens that the provider itself reported, 0 to 1. */
  providerReportedShare: number
}

export interface GenerationCostSummary {
  windowDays: number
  generations: number
  promptTokens: number
  completionTokens: number
  inputUsd: number
  outputUsd: number
  totalUsd: number
  /** Per provider+model breakdown, most expensive first. */
  rows: ModelCostRow[]
  /** True when the row cap was hit and the window is therefore partial. */
  truncated: boolean
  /** Share of all counted tokens reported by the provider rather than estimated. */
  providerReportedShare: number
  /** True when no durable generation rows were available for the window. */
  empty: boolean
  /** True when the underlying query failed and zeroes are being reported. */
  degraded: boolean
  basis: string
}

type CostAccumulator = {
  provider: string
  model: string
  generations: number
  promptTokens: number
  completionTokens: number
  providerReportedTokens: number
}

const emptySummary = (
  windowDays: number,
  overrides: Partial<GenerationCostSummary> = {},
): GenerationCostSummary => ({
  windowDays,
  generations: 0,
  promptTokens: 0,
  completionTokens: 0,
  inputUsd: 0,
  outputUsd: 0,
  totalUsd: 0,
  rows: [],
  truncated: false,
  providerReportedShare: 0,
  empty: true,
  degraded: false,
  basis: MODEL_COST_BASIS,
  ...overrides,
})

const roundUsd = (value: number): number => Math.round(value * 1e6) / 1e6
const roundShare = (value: number): number => Math.round(value * 1000) / 1000

const safeTokens = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

/**
 * Aggregate recorded generation spend for one user over a day window.
 *
 * Never throws: a query failure is logged and returned as a `degraded`
 * summary of zeroes, because an analytics panel must not take down the page
 * it sits on. Callers distinguish "no spend yet" (`empty`) from "could not be
 * read" (`degraded`) and must not present the latter as a real zero.
 */
export async function getGenerationCostSummary(
  userId: string,
  windowDays: number,
): Promise<GenerationCostSummary> {
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  let records: Array<{
    status: string
    promptTokens: number
    completionTokens: number
    usageSource: string
    message?: { provider: string | null; model: string | null } | null
  }>

  try {
    records = (await prisma.generation.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        status: { in: BILLABLE_STATUSES },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_GENERATION_COST_ROWS + 1,
      select: {
        status: true,
        promptTokens: true,
        completionTokens: true,
        usageSource: true,
        message: { select: { provider: true, model: true } },
      },
    })) as typeof records
  } catch (error) {
    logger.warn('generation_cost_summary_degraded', {
      windowDays: days,
      error: error instanceof Error ? error.message : String(error),
    })
    return emptySummary(days, { degraded: true, empty: false })
  }

  const truncated = records.length > MAX_GENERATION_COST_ROWS
  const counted = truncated ? records.slice(0, MAX_GENERATION_COST_ROWS) : records

  if (counted.length === 0) return emptySummary(days)

  const accumulators = new Map<string, CostAccumulator>()

  for (const record of counted) {
    const provider = (record.message?.provider ?? 'unknown').toLowerCase().trim() || 'unknown'
    const model = (record.message?.model ?? '').trim()
    const key = `${provider}:::${model}`

    const existing =
      accumulators.get(key) ??
      ({
        provider,
        model,
        generations: 0,
        promptTokens: 0,
        completionTokens: 0,
        providerReportedTokens: 0,
      } satisfies CostAccumulator)

    const promptTokens = safeTokens(record.promptTokens)
    const completionTokens = safeTokens(record.completionTokens)

    existing.generations += 1
    existing.promptTokens += promptTokens
    existing.completionTokens += completionTokens
    if (record.usageSource === 'provider') {
      existing.providerReportedTokens += promptTokens + completionTokens
    }

    accumulators.set(key, existing)
  }

  const rows: ModelCostRow[] = Array.from(accumulators.values()).map((entry) => {
    const estimate = estimateModelCost(entry.provider, entry.model, {
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
    })
    const totalTokens = entry.promptTokens + entry.completionTokens

    return {
      provider: entry.provider,
      model: entry.model || 'unknown',
      generations: entry.generations,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      inputUsd: estimate.inputUsd,
      outputUsd: estimate.outputUsd,
      totalUsd: estimate.totalUsd,
      precision: estimate.precision,
      providerReportedShare:
        totalTokens > 0 ? roundShare(entry.providerReportedTokens / totalTokens) : 0,
    }
  })

  rows.sort(
    (left, right) =>
      right.totalUsd - left.totalUsd ||
      right.generations - left.generations ||
      left.provider.localeCompare(right.provider) ||
      left.model.localeCompare(right.model),
  )

  const totals = rows.reduce(
    (acc, row) => {
      acc.generations += row.generations
      acc.promptTokens += row.promptTokens
      acc.completionTokens += row.completionTokens
      acc.inputUsd += row.inputUsd
      acc.outputUsd += row.outputUsd
      return acc
    },
    { generations: 0, promptTokens: 0, completionTokens: 0, inputUsd: 0, outputUsd: 0 },
  )

  const allTokens = totals.promptTokens + totals.completionTokens
  const providerReportedTokens = Array.from(accumulators.values()).reduce(
    (sum, entry) => sum + entry.providerReportedTokens,
    0,
  )

  return {
    windowDays: days,
    generations: totals.generations,
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
    inputUsd: roundUsd(totals.inputUsd),
    outputUsd: roundUsd(totals.outputUsd),
    totalUsd: roundUsd(totals.inputUsd + totals.outputUsd),
    rows,
    truncated,
    providerReportedShare:
      allTokens > 0 ? roundShare(providerReportedTokens / allTokens) : 0,
    empty: false,
    degraded: false,
    basis: MODEL_COST_BASIS,
  }
}
