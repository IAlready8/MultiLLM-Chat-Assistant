/**
 * Estimated per-provider LLM costs for analytics display.
 *
 * These are BLENDED estimates (average of input/output across popular models
 * per provider) as of October 2026. Actual costs vary by specific model,
 * input vs output token mix, and provider price changes.
 *
 * All values are USD per 1M tokens. Displayed as estimates only —
 * not for billing.
 */

export interface ProviderPricing {
  /** Blended USD cost per 1M tokens (input/output average) */
  perMillionTokens: number
  /** Human-readable note about the estimate basis */
  basis: string
}

export const PROVIDER_PRICING: Record<string, ProviderPricing> = {
  openai: {
    perMillionTokens: 5.0,
    basis: 'Blended GPT-4o and GPT-4o mini',
  },
  anthropic: {
    perMillionTokens: 8.0,
    basis: 'Blended Claude Sonnet and Haiku',
  },
  googleai: {
    perMillionTokens: 2.0,
    basis: 'Blended Gemini Flash and Pro',
  },
  openrouter: {
    perMillionTokens: 4.0,
    basis: 'Average across routed models',
  },
  grok: {
    perMillionTokens: 6.0,
    basis: 'Blended Grok models',
  },
  mistral: {
    perMillionTokens: 4.0,
    basis: 'Blended Mistral models',
  },
  kimi: {
    perMillionTokens: 3.0,
    basis: 'Blended Moonshot models',
  },
  ollama: {
    perMillionTokens: 0,
    basis: 'Local inference, no API cost',
  },
  deepseek: {
    perMillionTokens: 1.5,
    basis: 'Blended DeepSeek models',
  },
}

/**
 * Estimate USD cost for a given provider and token count.
 * Returns null if the provider has no pricing data.
 */
export function estimateCost(providerId: string, tokens: number): number | null {
  const pricing = PROVIDER_PRICING[providerId.toLowerCase()]
  if (!pricing) return null
  return (tokens / 1_000_000) * pricing.perMillionTokens
}
