/**
 * lib/token-counter.ts
 *
 * Token estimation utilities used across API routes, rate limiter decisions,
 * analytics tracking, and context window management.
 *
 * WHY ESTIMATION INSTEAD OF EXACT COUNTING
 * -----------------------------------------
 * Exact tokenization requires the provider's tokenizer library on the server
 * (tiktoken for OpenAI, sentencepiece for Anthropic, etc.). These add
 * significant bundle weight and cold-start overhead. The character-ratio
 * approach used here is accurate to within ~5-10% for typical English prose,
 * which is sufficient for rate limit and analytics purposes. For billing,
 * always use the token counts returned by the provider in the usage field.
 *
 * CALIBRATION BASIS
 * -----------------
 * OpenAI (BPE):     ~4.0 chars/token for English prose
 * Anthropic (BPE):  ~3.5 chars/token (Claude uses slightly denser encoding)
 * Google (SentencePiece): ~4.0 chars/token
 * Mistral (BPE):    ~4.0 chars/token (uses same family as Llama tokenizer)
 * Ollama (varies):  ~4.0 chars/token (conservative fallback)
 * Grok / OpenRouter: ~4.0 chars/token
 *
 * CONTEXT WINDOW LIMITS
 * ----------------------
 * Values here reflect published context windows as of 2026-08-01.
 * Update this table when providers announce new limits.
 */

import type { ProviderMessage } from '@/lib/providers/types'

// ---------------------------------------------------------------------------
// Chars-per-token ratios by provider
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN: Record<string, number> = {
  openai: 4.0,
  anthropic: 3.5,
  googleai: 4.0,
  mistral: 4.0,
  ollama: 4.0,
  grok: 4.0,
  openrouter: 4.0,
  kimi: 4.0,
  // Fallback for unknown providers
  default: 4.0,
}

// ---------------------------------------------------------------------------
// Context window limits by provider and model
// ---------------------------------------------------------------------------

interface ContextWindowEntry {
  /** Pattern to match against the model string (substring, case-insensitive). */
  pattern: string
  /** Max context in tokens. */
  tokens: number
}

const CONTEXT_WINDOWS: Record<string, ContextWindowEntry[]> = {
  openai: [
    { pattern: 'gpt-5.6',             tokens: 1_050_000 },
    { pattern: 'gpt-4o',              tokens: 128_000 },
    { pattern: 'gpt-4-turbo',         tokens: 128_000 },
    { pattern: 'gpt-4-32k',           tokens: 32_768  },
    { pattern: 'gpt-4',               tokens: 8_192   },
    { pattern: 'gpt-3.5-turbo-16k',   tokens: 16_385  },
    { pattern: 'gpt-3.5-turbo',       tokens: 16_385  },
    { pattern: 'o1',                  tokens: 128_000 },
    { pattern: 'o3',                  tokens: 200_000 },
  ],
  anthropic: [
    { pattern: 'claude-fable-5',      tokens: 1_000_000 },
    { pattern: 'claude-opus-5',       tokens: 1_000_000 },
    { pattern: 'claude-sonnet-5',     tokens: 1_000_000 },
    { pattern: 'claude-haiku-4-5',    tokens: 200_000 },
    { pattern: 'claude-3-5-sonnet',   tokens: 200_000 },
    { pattern: 'claude-3-5-haiku',    tokens: 200_000 },
    { pattern: 'claude-3-opus',       tokens: 200_000 },
    { pattern: 'claude-3-sonnet',     tokens: 200_000 },
    { pattern: 'claude-3-haiku',      tokens: 200_000 },
    { pattern: 'claude-2.1',          tokens: 200_000 },
    { pattern: 'claude-2',            tokens: 100_000 },
    { pattern: 'claude',              tokens: 200_000 },
  ],
  googleai: [
    { pattern: 'gemini-1.5-pro',      tokens: 1_048_576 },
    { pattern: 'gemini-1.5-flash',    tokens: 1_048_576 },
    { pattern: 'gemini-pro',          tokens: 32_760   },
    { pattern: 'gemini',              tokens: 32_760   },
  ],
  mistral: [
    { pattern: 'mistral-large',       tokens: 128_000 },
    { pattern: 'mistral-medium',      tokens: 32_000  },
    { pattern: 'mistral-small',       tokens: 32_000  },
    { pattern: 'mistral-tiny',        tokens: 32_000  },
    { pattern: 'open-mixtral-8x22b',  tokens: 64_000  },
    { pattern: 'open-mixtral-8x7b',   tokens: 32_000  },
    { pattern: 'open-mistral-7b',     tokens: 32_000  },
    { pattern: 'codestral',           tokens: 32_000  },
    { pattern: 'mistral',             tokens: 32_000  },
  ],
  ollama: [
    // Ollama model limits depend on the pulled model. Use conservative defaults.
    { pattern: 'llama3',              tokens: 8_192   },
    { pattern: 'llama2',              tokens: 4_096   },
    { pattern: 'mistral',             tokens: 32_000  },
    { pattern: 'mixtral',             tokens: 32_000  },
    { pattern: 'phi3',                tokens: 128_000 },
    { pattern: 'gemma2',              tokens: 8_192   },
    { pattern: 'gemma',               tokens: 8_192   },
    { pattern: 'codellama',           tokens: 16_384  },
    { pattern: 'qwen2',               tokens: 32_000  },
    { pattern: 'deepseek',            tokens: 16_384  },
  ],
  grok: [
    { pattern: 'grok-2',              tokens: 131_072 },
    { pattern: 'grok-1',              tokens: 8_192   },
    { pattern: 'grok',                tokens: 131_072 },
  ],
  openrouter: [
    // OpenRouter routes to underlying models - use a safe conservative default
    { pattern: '', tokens: 16_000 },
  ],
  kimi: [
    { pattern: 'kimi-k3', tokens: 1_048_576 },
    { pattern: 'kimi-k2.7', tokens: 262_144 },
    { pattern: 'kimi-k2.6', tokens: 262_144 },
    { pattern: 'kimi', tokens: 262_144 },
  ],
}

const DEFAULT_CONTEXT_WINDOW = 8_192

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Estimate the number of tokens in a plain text string.
 *
 * @param text - The text to estimate.
 * @param provider - Optional provider ID for calibrated ratio. Defaults to 4.0 chars/token.
 * @returns Estimated token count, minimum 1.
 */
export function estimateTokens(text: string, provider?: string): number {
  if (!text || text.length === 0) return 0
  const ratio = CHARS_PER_TOKEN[provider ?? 'default'] ?? CHARS_PER_TOKEN.default
  return Math.max(1, Math.round(text.length / ratio))
}

/**
 * Estimate the total token count for a messages array.
 * Includes a small per-message overhead (role label + framing tokens).
 *
 * @param messages - Array of ProviderMessage objects.
 * @param provider - Optional provider ID for calibrated ratio.
 * @returns Estimated total token count.
 */
export function estimateMessagesTokens(
  messages: ProviderMessage[],
  provider?: string,
): number {
  if (!messages || messages.length === 0) return 0
  const PER_MESSAGE_OVERHEAD = 4 // role + framing tokens
  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content, provider) + PER_MESSAGE_OVERHEAD
  }, 0)
}

/**
 * Get the published context window limit for a provider + model combination.
 *
 * @param provider - Provider ID (e.g. "openai", "anthropic").
 * @param model - Model string (e.g. "gpt-4o", "claude-3-5-sonnet-20241022").
 * @returns Max context window in tokens.
 */
export function getContextWindowLimit(provider: string, model: string): number {
  const entries = CONTEXT_WINDOWS[provider.toLowerCase()]
  if (!entries) return DEFAULT_CONTEXT_WINDOW

  const modelLower = model.toLowerCase()
  for (const entry of entries) {
    if (!entry.pattern || modelLower.includes(entry.pattern.toLowerCase())) {
      return entry.tokens
    }
  }
  return DEFAULT_CONTEXT_WINDOW
}

/**
 * Check if a messages array is within the context window for a given
 * provider + model. Returns { fits: boolean, estimated: number, limit: number }.
 *
 * @param messages - Messages to check.
 * @param provider - Provider ID.
 * @param model - Model string.
 * @param reserveOutputTokens - Tokens to reserve for the model's response. Default 1024.
 */
export function checkContextFits(
  messages: ProviderMessage[],
  provider: string,
  model: string,
  reserveOutputTokens = 1024,
): { fits: boolean; estimated: number; limit: number; available: number } {
  const estimated = estimateMessagesTokens(messages, provider)
  const limit = getContextWindowLimit(provider, model)
  const available = limit - reserveOutputTokens
  return {
    fits: estimated <= available,
    estimated,
    limit,
    available,
  }
}
