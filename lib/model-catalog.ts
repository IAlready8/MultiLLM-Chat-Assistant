/**
 * lib/model-catalog.ts
 *
 * Single source of truth for all provider model listings.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Model IDs were previously hardcoded as inline constants in three separate
 * page files (ai-roundtable, comparison, multi-chat). Each had a slightly
 * different set. When a provider releases or deprecates a model, all three
 * needed to be patched. This catalog centralizes that.
 *
 * WHAT LIVES HERE
 * ---------------
 * - MODEL_CATALOG: the complete provider -> model[] mapping
 * - getModelsForProvider(): returns models for a provider ID (safe, no throw)
 * - getDefaultModel(): returns the default model string for a provider
 * - getAllProviderIds(): returns all known provider IDs
 * - isKnownModel(): validates a model ID against the catalog
 *
 * MAINTENANCE
 * -----------
 * Update the catalog here when providers announce new models or deprecations.
 * Mark deprecated models with isDeprecated: true rather than removing them
 * so that saved conversations referencing old model IDs do not break.
 *
 * Models are listed newest-first within each provider.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelInfo {
  /** The exact model ID string sent to the provider API. */
  id: string
  /** Human-readable display name shown in the UI. */
  displayName: string
  /** Published context window in tokens. Keep in sync with lib/token-counter.ts. */
  contextWindow: number
  /** Whether this model is the default selection for this provider. */
  isDefault: boolean
  /** Whether this model is deprecated upstream. Still listed for compat. */
  isDeprecated?: boolean
  /** Optional short capability tag shown in model pickers. */
  tag?: string
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const MODEL_CATALOG: Record<string, ModelInfo[]> = {
  openai: [
    {
      id: 'gpt-5.6-sol',
      displayName: 'GPT-5.6 Sol',
      contextWindow: 1_050_000,
      isDefault: false,
      tag: 'frontier',
    },
    {
      id: 'gpt-5.6-terra',
      displayName: 'GPT-5.6 Terra',
      contextWindow: 1_050_000,
      isDefault: false,
      tag: 'balanced',
    },
    {
      id: 'gpt-5.6-luna',
      displayName: 'GPT-5.6 Luna',
      contextWindow: 1_050_000,
      isDefault: false,
      tag: 'economy',
    },
    {
      id: 'gpt-4o',
      displayName: 'GPT-4o',
      contextWindow: 128_000,
      isDefault: true,
      tag: 'flagship',
    },
    {
      id: 'gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      contextWindow: 128_000,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'gpt-4-turbo',
      displayName: 'GPT-4 Turbo',
      contextWindow: 128_000,
      isDefault: false,
    },
    {
      id: 'gpt-4',
      displayName: 'GPT-4',
      contextWindow: 8_192,
      isDefault: false,
    },
    {
      id: 'gpt-4-32k',
      displayName: 'GPT-4 32K',
      contextWindow: 32_768,
      isDefault: false,
      isDeprecated: true,
    },
    {
      id: 'gpt-3.5-turbo',
      displayName: 'GPT-3.5 Turbo',
      contextWindow: 16_385,
      isDefault: false,
      tag: 'economy',
    },
    {
      id: 'o1',
      displayName: 'o1',
      contextWindow: 128_000,
      isDefault: false,
      tag: 'reasoning',
    },
    {
      id: 'o3-mini',
      displayName: 'o3-mini',
      contextWindow: 200_000,
      isDefault: false,
      tag: 'reasoning',
    },
  ],

  anthropic: [
    {
      id: 'claude-fable-5',
      displayName: 'Claude Fable 5',
      contextWindow: 1_000_000,
      isDefault: false,
      tag: 'frontier',
    },
    {
      id: 'claude-opus-5',
      displayName: 'Claude Opus 5',
      contextWindow: 1_000_000,
      isDefault: false,
      tag: 'flagship',
    },
    {
      id: 'claude-sonnet-5',
      displayName: 'Claude Sonnet 5',
      contextWindow: 1_000_000,
      isDefault: false,
      tag: 'balanced',
    },
    {
      id: 'claude-haiku-4-5-20251001',
      displayName: 'Claude Haiku 4.5',
      contextWindow: 200_000,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      displayName: 'Claude 3.5 Sonnet',
      contextWindow: 200_000,
      isDefault: true,
      tag: 'flagship',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      displayName: 'Claude 3.5 Haiku',
      contextWindow: 200_000,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'claude-3-opus-20240229',
      displayName: 'Claude 3 Opus',
      contextWindow: 200_000,
      isDefault: false,
    },
    {
      id: 'claude-3-sonnet-20240229',
      displayName: 'Claude 3 Sonnet',
      contextWindow: 200_000,
      isDefault: false,
      isDeprecated: true,
    },
    {
      id: 'claude-3-haiku-20240307',
      displayName: 'Claude 3 Haiku',
      contextWindow: 200_000,
      isDefault: false,
      isDeprecated: true,
    },
    {
      id: 'claude-2.1',
      displayName: 'Claude 2.1',
      contextWindow: 200_000,
      isDefault: false,
      isDeprecated: true,
    },
  ],

  googleai: [
    {
      id: 'gemini-1.5-pro',
      displayName: 'Gemini 1.5 Pro',
      contextWindow: 1_048_576,
      isDefault: true,
      tag: 'flagship',
    },
    {
      id: 'gemini-1.5-flash',
      displayName: 'Gemini 1.5 Flash',
      contextWindow: 1_048_576,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'gemini-2.0-flash',
      displayName: 'Gemini 2.0 Flash',
      contextWindow: 1_048_576,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'gemini-pro',
      displayName: 'Gemini Pro',
      contextWindow: 32_760,
      isDefault: false,
      isDeprecated: true,
    },
  ],

  mistral: [
    {
      id: 'mistral-large-latest',
      displayName: 'Mistral Large',
      contextWindow: 128_000,
      isDefault: true,
      tag: 'flagship',
    },
    {
      id: 'mistral-small-latest',
      displayName: 'Mistral Small',
      contextWindow: 32_000,
      isDefault: false,
      tag: 'economy',
    },
    {
      id: 'open-mixtral-8x22b',
      displayName: 'Mixtral 8x22B',
      contextWindow: 64_000,
      isDefault: false,
    },
    {
      id: 'open-mixtral-8x7b',
      displayName: 'Mixtral 8x7B',
      contextWindow: 32_000,
      isDefault: false,
    },
    {
      id: 'open-mistral-7b',
      displayName: 'Mistral 7B',
      contextWindow: 32_000,
      isDefault: false,
    },
    {
      id: 'codestral-latest',
      displayName: 'Codestral',
      contextWindow: 32_000,
      isDefault: false,
      tag: 'code',
    },
  ],

  ollama: [
    {
      id: 'llama3',
      displayName: 'Llama 3 (8B)',
      contextWindow: 8_192,
      isDefault: true,
    },
    {
      id: 'llama3:70b',
      displayName: 'Llama 3 (70B)',
      contextWindow: 8_192,
      isDefault: false,
    },
    {
      id: 'llama2',
      displayName: 'Llama 2 (7B)',
      contextWindow: 4_096,
      isDefault: false,
      isDeprecated: true,
    },
    {
      id: 'mistral',
      displayName: 'Mistral 7B (local)',
      contextWindow: 32_000,
      isDefault: false,
    },
    {
      id: 'mixtral',
      displayName: 'Mixtral 8x7B (local)',
      contextWindow: 32_000,
      isDefault: false,
    },
    {
      id: 'phi3',
      displayName: 'Phi-3 Mini',
      contextWindow: 128_000,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'gemma2',
      displayName: 'Gemma 2 (9B)',
      contextWindow: 8_192,
      isDefault: false,
    },
    {
      id: 'gemma2:27b',
      displayName: 'Gemma 2 (27B)',
      contextWindow: 8_192,
      isDefault: false,
    },
    {
      id: 'codellama',
      displayName: 'Code Llama',
      contextWindow: 16_384,
      isDefault: false,
      tag: 'code',
    },
    {
      id: 'qwen2',
      displayName: 'Qwen 2 (7B)',
      contextWindow: 32_000,
      isDefault: false,
    },
    {
      id: 'deepseek-coder',
      displayName: 'DeepSeek Coder',
      contextWindow: 16_384,
      isDefault: false,
      tag: 'code',
    },
  ],

  grok: [
    {
      id: 'grok-2',
      displayName: 'Grok 2',
      contextWindow: 131_072,
      isDefault: true,
      tag: 'flagship',
    },
    {
      id: 'grok-2-mini',
      displayName: 'Grok 2 Mini',
      contextWindow: 131_072,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'grok-1',
      displayName: 'Grok 1',
      contextWindow: 8_192,
      isDefault: false,
      isDeprecated: true,
    },
  ],

  openrouter: [
    {
      id: 'openrouter/auto',
      displayName: 'Auto (best available)',
      contextWindow: 32_000,
      isDefault: true,
    },
    {
      id: 'openai/gpt-4o',
      displayName: 'GPT-4o (via OpenRouter)',
      contextWindow: 128_000,
      isDefault: false,
    },
    {
      id: 'anthropic/claude-3-5-sonnet',
      displayName: 'Claude 3.5 Sonnet (via OpenRouter)',
      contextWindow: 200_000,
      isDefault: false,
    },
    {
      id: 'google/gemini-1.5-pro',
      displayName: 'Gemini 1.5 Pro (via OpenRouter)',
      contextWindow: 1_048_576,
      isDefault: false,
    },
    {
      id: 'mistralai/mistral-large',
      displayName: 'Mistral Large (via OpenRouter)',
      contextWindow: 128_000,
      isDefault: false,
    },
    {
      id: 'meta-llama/llama-3-70b-instruct',
      displayName: 'Llama 3 70B (via OpenRouter)',
      contextWindow: 8_192,
      isDefault: false,
    },
    {
      id: 'deepseek/deepseek-r1',
      displayName: 'DeepSeek R1 (via OpenRouter)',
      contextWindow: 64_000,
      isDefault: false,
      tag: 'reasoning',
    },
  ],

  kimi: [
    {
      id: 'kimi-k3',
      displayName: 'Kimi K3',
      contextWindow: 1_048_576,
      isDefault: true,
      tag: 'flagship',
    },
    {
      id: 'kimi-k2.7-code',
      displayName: 'Kimi K2.7 Code',
      contextWindow: 262_144,
      isDefault: false,
      tag: 'code',
    },
    {
      id: 'kimi-k2.7-code-highspeed',
      displayName: 'Kimi K2.7 Code Highspeed',
      contextWindow: 262_144,
      isDefault: false,
      tag: 'fast',
    },
    {
      id: 'kimi-k2.6',
      displayName: 'Kimi K2.6',
      contextWindow: 262_144,
      isDefault: false,
    },
  ],

  deepseek: [
    {
      id: 'deepseek-ai/DeepSeek-V4-Flash-0731',
      displayName: 'DeepSeek V4 Flash 0731 (Unavailable)',
      contextWindow: 393_216,
      isDefault: true,
      tag: 'experimental',
    },
  ],
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Get all models for a provider. Returns [] for unknown providers rather
 * than throwing, so UI components degrade gracefully.
 */
export function getModelsForProvider(providerId: string): ModelInfo[] {
  return MODEL_CATALOG[providerId] ?? []
}

/**
 * Get the default model ID string for a provider.
 * Falls back to the first model in the list, then empty string.
 */
export function getDefaultModel(providerId: string): string {
  const models = getModelsForProvider(providerId)
  const defaultModel = models.find((m) => m.isDefault)
  return defaultModel?.id ?? models[0]?.id ?? ''
}

/**
 * Get all provider IDs that have at least one model in the catalog.
 */
export function getAllProviderIds(): string[] {
  return Object.keys(MODEL_CATALOG)
}

/**
 * Check whether a model ID is recognized for a given provider.
 * Includes deprecated models since they may appear in saved conversations.
 */
export function isKnownModel(providerId: string, modelId: string): boolean {
  return getModelsForProvider(providerId).some((m) => m.id === modelId)
}

/**
 * Get a flat list of all models across all providers, optionally excluding
 * deprecated entries.
 */
export function getAllModels(includeDeprecated = false): (ModelInfo & { provider: string })[] {
  const result: (ModelInfo & { provider: string })[] = []
  for (const [provider, models] of Object.entries(MODEL_CATALOG)) {
    for (const model of models) {
      if (!includeDeprecated && model.isDeprecated) continue
      result.push({ ...model, provider })
    }
  }
  return result
}
