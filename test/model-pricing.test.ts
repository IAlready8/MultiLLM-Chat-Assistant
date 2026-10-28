import { describe, expect, it } from 'vitest'

import { getAllModels } from '@/lib/model-catalog'
import {
  estimateModelCost,
  MODEL_COST_BASIS,
  MODEL_RATES,
  modelsMissingExplicitRates,
  PROVIDER_FALLBACK_RATES,
  resolveTokenRates,
} from '@/lib/model-pricing'

describe('resolveTokenRates', () => {
  it('matches an exact catalog model', () => {
    const resolved = resolveTokenRates('openai', 'gpt-4o')
    expect(resolved.precision).toBe('model')
    expect(resolved.rates).toEqual({ inputPerMillion: 2.5, outputPerMillion: 10.0 })
  })

  it('is case and whitespace insensitive', () => {
    expect(resolveTokenRates('OpenAI', '  GPT-4o  ')).toEqual(
      resolveTokenRates('openai', 'gpt-4o'),
    )
  })

  it('resolves a dated provider alias to its undated entry', () => {
    const dated = resolveTokenRates('anthropic', 'claude-sonnet-5-2026-02-01')
    expect(dated.precision).toBe('model')
    expect(dated.rates).toEqual(MODEL_RATES['claude-sonnet-5'])
  })

  it('falls back to the provider rate for an unknown model and says so', () => {
    const resolved = resolveTokenRates('anthropic', 'claude-does-not-exist')
    expect(resolved.precision).toBe('provider-fallback')
    expect(resolved.rates).toEqual(PROVIDER_FALLBACK_RATES.anthropic)
  })

  it('falls back to the provider rate when no model is given', () => {
    expect(resolveTokenRates('openai', null).precision).toBe('provider-fallback')
    expect(resolveTokenRates('openai', undefined).rates).toEqual(
      PROVIDER_FALLBACK_RATES.openai,
    )
    expect(resolveTokenRates('openai', '').rates).toEqual(PROVIDER_FALLBACK_RATES.openai)
  })

  it('prices local Ollama inference at zero', () => {
    const resolved = resolveTokenRates('ollama', 'llama3')
    expect(resolved.precision).toBe('model')
    expect(resolved.rates).toEqual({ inputPerMillion: 0, outputPerMillion: 0 })
  })

  it('uses a mid-market default for an entirely unknown provider', () => {
    const resolved = resolveTokenRates('not-a-provider', 'not-a-model')
    expect(resolved.precision).toBe('provider-fallback')
    // Never zero: reporting unknown usage as free would understate spend.
    expect(resolved.rates.inputPerMillion).toBeGreaterThan(0)
    expect(resolved.rates.outputPerMillion).toBeGreaterThan(0)
  })

  it('prices output at or above input for every paid rate pair', () => {
    for (const [model, rates] of Object.entries(MODEL_RATES)) {
      expect(
        rates.outputPerMillion,
        `${model} output rate must not undercut its input rate`,
      ).toBeGreaterThanOrEqual(rates.inputPerMillion)
    }
  })
})

describe('estimateModelCost', () => {
  it('prices input and output separately', () => {
    const estimate = estimateModelCost('openai', 'gpt-4o', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    })

    expect(estimate.inputUsd).toBe(2.5)
    expect(estimate.outputUsd).toBe(10)
    expect(estimate.totalUsd).toBe(12.5)
    expect(estimate.precision).toBe('model')
  })

  it('distinguishes two workloads a blended rate would price identically', () => {
    // Same 1M total tokens, opposite input/output mix. A single blended rate
    // on a combined total reports these as equal; they are not.
    const inputHeavy = estimateModelCost('openai', 'gpt-4o', {
      promptTokens: 900_000,
      completionTokens: 100_000,
    })
    const outputHeavy = estimateModelCost('openai', 'gpt-4o', {
      promptTokens: 100_000,
      completionTokens: 900_000,
    })

    expect(inputHeavy.totalUsd).toBeCloseTo(3.25, 6)
    expect(outputHeavy.totalUsd).toBeCloseTo(9.25, 6)
    expect(outputHeavy.totalUsd).toBeGreaterThan(inputHeavy.totalUsd * 2)
  })

  it('separates models within one provider by more than an order of magnitude', () => {
    const flagship = estimateModelCost('openai', 'gpt-4', {
      promptTokens: 500_000,
      completionTokens: 500_000,
    })
    const small = estimateModelCost('openai', 'gpt-4o-mini', {
      promptTokens: 500_000,
      completionTokens: 500_000,
    })

    expect(flagship.totalUsd / small.totalUsd).toBeGreaterThan(10)
  })

  it('returns zero for a zero-token aggregate', () => {
    const estimate = estimateModelCost('openai', 'gpt-4o', {
      promptTokens: 0,
      completionTokens: 0,
    })
    expect(estimate).toMatchObject({ inputUsd: 0, outputUsd: 0, totalUsd: 0 })
  })

  it('floors hostile token counts instead of throwing', () => {
    for (const tokens of [
      { promptTokens: -5, completionTokens: -5 },
      { promptTokens: Number.NaN, completionTokens: Number.NaN },
      { promptTokens: Number.POSITIVE_INFINITY, completionTokens: 0 },
    ]) {
      const estimate = estimateModelCost('openai', 'gpt-4o', tokens)
      expect(estimate.totalUsd).toBe(0)
      expect(Number.isFinite(estimate.totalUsd)).toBe(true)
    }

    const fractional = estimateModelCost('openai', 'gpt-4o', {
      promptTokens: 1_000_000.9,
      completionTokens: 0,
    })
    expect(fractional.inputUsd).toBe(2.5)
  })

  it('prices local inference at zero cost', () => {
    const estimate = estimateModelCost('ollama', 'llama3', {
      promptTokens: 5_000_000,
      completionTokens: 5_000_000,
    })
    expect(estimate.totalUsd).toBe(0)
  })

  it('reports a provider fallback so a surface can label the weaker estimate', () => {
    const estimate = estimateModelCost('mistral', 'mistral-unreleased', {
      promptTokens: 1_000,
      completionTokens: 1_000,
    })
    expect(estimate.precision).toBe('provider-fallback')
    expect(estimate.totalUsd).toBeGreaterThan(0)
  })

  it('states that the figure is not an invoice', () => {
    expect(MODEL_COST_BASIS).toMatch(/estimate only, not an invoice/i)
  })
})

describe('catalog coverage', () => {
  it('prices every non-deprecated catalog model from an exact rate entry', () => {
    // A model reaching production without a published rate silently degrades
    // to a provider average; this keeps that from happening unnoticed.
    expect(modelsMissingExplicitRates()).toEqual([])
  })

  it('covers every provider in the catalog with a fallback rate', () => {
    const providers = new Set(getAllModels(true).map(model => model.provider))
    for (const provider of providers) {
      expect(
        PROVIDER_FALLBACK_RATES[provider],
        `missing fallback rates for provider ${provider}`,
      ).toBeDefined()
    }
  })

  it('prices deprecated models too, so saved history stays costable', () => {
    const deprecated = getAllModels(true).filter(model => model.isDeprecated)
    expect(deprecated.length).toBeGreaterThan(0)
    for (const model of deprecated) {
      const estimate = estimateModelCost(model.provider, model.id, {
        promptTokens: 1_000,
        completionTokens: 1_000,
      })
      expect(Number.isFinite(estimate.totalUsd)).toBe(true)
    }
  })
})
