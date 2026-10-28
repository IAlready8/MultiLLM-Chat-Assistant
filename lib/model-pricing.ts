/**
 * lib/model-pricing.ts
 *
 * Per-model input/output token rates, used to turn durable generation token
 * counts into a cost estimate.
 *
 * WHY THIS EXISTS ALONGSIDE lib/provider-pricing.ts
 * -------------------------------------------------
 * `lib/provider-pricing.ts` holds one blended USD-per-1M-tokens figure per
 * provider and applies it to a single combined token total. Two things make
 * that materially wrong for a comparison tool:
 *
 *   1. Output tokens cost several times more than input tokens on every
 *      major provider (commonly 3x to 5x). A blended rate applied to a
 *      combined total misreports any workload whose input/output mix differs
 *      from the assumed average -- which is every real workload.
 *   2. One rate per provider cannot separate models that differ by more than
 *      an order of magnitude in price. A provider's small and flagship models
 *      priced identically makes a side-by-side model comparison misleading
 *      exactly where the product's value is supposed to be.
 *
 * This module keeps input and output rates distinct and resolves them per
 * model, falling back to a per-provider rate pair and reporting which of the
 * two happened. `lib/provider-pricing.ts` is left in place and still backs the
 * pre-existing `estimatedCostUsd` field on the analytics payload, so nothing
 * that consumed it changed.
 *
 * STATUS OF THESE NUMBERS
 * -----------------------
 * These are published list prices recorded against the model catalog, in USD
 * per 1,000,000 tokens. They are NOT invoice-grade:
 *
 *   - they exclude discounts, committed-use pricing and negotiated rates
 *   - they exclude cached-input pricing, which is cheaper on several providers
 *   - they exclude batch tiers
 *   - they exclude request, image and tool surcharges
 *   - OpenRouter prices vary per routed model, so only a rough average exists
 *   - provider list prices change without notice
 *
 * Every surface that renders these values must label them an estimate. The
 * authoritative figure is always the provider's own invoice.
 *
 * MAINTENANCE
 * -----------
 * Model IDs here mirror `lib/model-catalog.ts`. A model in the catalog with no
 * entry here resolves to its provider fallback and is reported with
 * `precision: 'provider-fallback'`, so a missing entry degrades the estimate
 * rather than dropping the cost silently. `test/model-pricing.test.ts` asserts
 * that every non-deprecated catalog model resolves to a usable rate.
 */

import { getAllModels } from '@/lib/model-catalog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenRates {
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPerMillion: number
  /** USD per 1,000,000 output (completion) tokens. */
  outputPerMillion: number
}

export type CostPrecision = 'model' | 'provider-fallback'

export interface ModelCostEstimate {
  inputUsd: number
  outputUsd: number
  totalUsd: number
  rates: TokenRates
  /**
   * `model` when the exact model matched a published rate pair.
   * `provider-fallback` when a provider-level average was used instead.
   */
  precision: CostPrecision
}

export interface TokenCounts {
  promptTokens: number
  completionTokens: number
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/**
 * Per-provider fallback rates, used when a model has no explicit entry.
 *
 * Deliberately set toward the middle of each provider's published range so a
 * missing model entry does not swing an estimate wildly in either direction.
 */
export const PROVIDER_FALLBACK_RATES: Readonly<Record<string, TokenRates>> = {
  openai: { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  anthropic: { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  googleai: { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  openrouter: { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  grok: { inputPerMillion: 2.0, outputPerMillion: 10.0 },
  mistral: { inputPerMillion: 2.0, outputPerMillion: 6.0 },
  kimi: { inputPerMillion: 0.6, outputPerMillion: 2.5 },
  deepseek: { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  ollama: { inputPerMillion: 0, outputPerMillion: 0 },
}

/**
 * Published list rates per exact model ID, in USD per 1M tokens.
 *
 * Keys are lower-cased model IDs from `lib/model-catalog.ts`.
 */
export const MODEL_RATES: Readonly<Record<string, TokenRates>> = {
  // --- OpenAI -------------------------------------------------------------
  'gpt-6-astra': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'gpt-5.6-sol': { inputPerMillion: 5.0, outputPerMillion: 20.0 },
  'gpt-5.6-terra': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-5.6-luna': { inputPerMillion: 0.6, outputPerMillion: 2.4 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4-turbo': { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  'gpt-4': { inputPerMillion: 30.0, outputPerMillion: 60.0 },
  'gpt-4-32k': { inputPerMillion: 60.0, outputPerMillion: 120.0 },
  'gpt-3.5-turbo': { inputPerMillion: 0.5, outputPerMillion: 1.5 },
  o1: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },

  // --- Anthropic ----------------------------------------------------------
  'claude-fable-5': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-opus-5': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-sonnet-5': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-haiku-4-5-20251001': { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  'claude-3-5-sonnet-20241022': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  'claude-3-opus-20240229': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'claude-3-sonnet-20240229': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  'claude-2.1': { inputPerMillion: 8.0, outputPerMillion: 24.0 },

  // --- Google AI ----------------------------------------------------------
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-pro': { inputPerMillion: 0.5, outputPerMillion: 1.5 },

  // --- Mistral ------------------------------------------------------------
  'mistral-large-latest': { inputPerMillion: 2.0, outputPerMillion: 6.0 },
  'mistral-small-latest': { inputPerMillion: 0.2, outputPerMillion: 0.6 },
  'open-mixtral-8x22b': { inputPerMillion: 2.0, outputPerMillion: 6.0 },
  'open-mixtral-8x7b': { inputPerMillion: 0.7, outputPerMillion: 0.7 },
  'open-mistral-7b': { inputPerMillion: 0.25, outputPerMillion: 0.25 },
  'codestral-latest': { inputPerMillion: 0.3, outputPerMillion: 0.9 },

  // --- Grok ---------------------------------------------------------------
  'grok-2': { inputPerMillion: 2.0, outputPerMillion: 10.0 },
  'grok-2-mini': { inputPerMillion: 0.2, outputPerMillion: 1.0 },
  'grok-1': { inputPerMillion: 5.0, outputPerMillion: 15.0 },

  // --- Kimi (Moonshot) ----------------------------------------------------
  'kimi-k3': { inputPerMillion: 0.6, outputPerMillion: 2.5 },
  'kimi-k2.7-code': { inputPerMillion: 0.6, outputPerMillion: 2.5 },
  'kimi-k2.7-code-highspeed': { inputPerMillion: 1.2, outputPerMillion: 5.0 },
  'kimi-k2.6': { inputPerMillion: 0.5, outputPerMillion: 2.0 },

  // --- DeepSeek -----------------------------------------------------------
  'deepseek-ai/deepseek-v4-flash-0731': { inputPerMillion: 0.3, outputPerMillion: 1.2 },

  // --- OpenRouter (routed; averages only) ---------------------------------
  'openrouter/auto': { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  'openai/gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'anthropic/claude-3-5-sonnet': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'google/gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  'mistralai/mistral-large': { inputPerMillion: 2.0, outputPerMillion: 6.0 },
  'meta-llama/llama-3-70b-instruct': { inputPerMillion: 0.3, outputPerMillion: 0.4 },
  'deepseek/deepseek-r1': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
}

/** Rates for locally served models, which have no per-token API charge. */
const ZERO_RATES: TokenRates = { inputPerMillion: 0, outputPerMillion: 0 }

/**
 * Last-resort rate pair when neither the model nor its provider is known.
 *
 * Mid-market rather than zero: reporting an unknown model as free would
 * understate spend, which is the more damaging direction to be wrong in.
 */
const UNKNOWN_PROVIDER_RATES: TokenRates = {
  inputPerMillion: 2.0,
  outputPerMillion: 8.0,
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const normalize = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase()

/**
 * Strip a trailing provider date suffix, so `claude-x-20260101` can match a
 * `claude-x` entry. Mirrors the dated-alias handling in `lib/token-counter.ts`.
 */
function undatedModelId(model: string): string | null {
  const match = model.match(/^(.*)-\d{4}-\d{2}-\d{2}$/)
  return match ? match[1] : null
}

/**
 * Resolve the rate pair for a provider and model.
 *
 * Resolution order: exact model, undated model alias, provider fallback,
 * unknown-provider default. Ollama always resolves to zero.
 */
export function resolveTokenRates(
  provider: string,
  model: string | null | undefined,
): { rates: TokenRates; precision: CostPrecision } {
  const providerKey = normalize(provider)
  const modelKey = normalize(model)

  if (providerKey === 'ollama') {
    return { rates: ZERO_RATES, precision: 'model' }
  }

  if (modelKey) {
    const exact = MODEL_RATES[modelKey]
    if (exact) return { rates: exact, precision: 'model' }

    const undated = undatedModelId(modelKey)
    if (undated) {
      const aliased = MODEL_RATES[undated]
      if (aliased) return { rates: aliased, precision: 'model' }
    }
  }

  const fallback = PROVIDER_FALLBACK_RATES[providerKey]
  if (fallback) return { rates: fallback, precision: 'provider-fallback' }

  return { rates: UNKNOWN_PROVIDER_RATES, precision: 'provider-fallback' }
}

const sanitizeTokens = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

/** Round to whole cents for display without accumulating float drift. */
const roundUsd = (value: number): number => Math.round(value * 1e6) / 1e6

/**
 * Estimate the cost of one generation, or of an aggregate with summed tokens.
 *
 * Input and output are priced separately, which is the whole point of this
 * module. Negative, NaN and fractional token counts are floored to a safe
 * integer rather than throwing, because these values originate in provider
 * usage payloads that are not fully trustworthy.
 */
export function estimateModelCost(
  provider: string,
  model: string | null | undefined,
  tokens: TokenCounts,
): ModelCostEstimate {
  const { rates, precision } = resolveTokenRates(provider, model)
  const promptTokens = sanitizeTokens(tokens.promptTokens)
  const completionTokens = sanitizeTokens(tokens.completionTokens)

  const inputUsd = roundUsd((promptTokens / 1_000_000) * rates.inputPerMillion)
  const outputUsd = roundUsd(
    (completionTokens / 1_000_000) * rates.outputPerMillion,
  )

  return {
    inputUsd,
    outputUsd,
    totalUsd: roundUsd(inputUsd + outputUsd),
    rates,
    precision,
  }
}

/** Fixed label every surface rendering these numbers must show. */
export const MODEL_COST_BASIS =
  'Published list prices applied to recorded token counts. Estimate only, not an invoice.'

/**
 * Catalog models that have no explicit rate entry.
 *
 * Returned as `provider:model` pairs for the maintenance test and for
 * operator diagnostics; not used on a request path.
 */
export function modelsMissingExplicitRates(): string[] {
  return getAllModels(false)
    .filter(
      (model) =>
        resolveTokenRates(model.provider, model.id).precision !== 'model',
    )
    .map((model) => `${model.provider}:${model.id}`)
    .sort()
}
