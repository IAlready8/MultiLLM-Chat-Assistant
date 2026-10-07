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
 * which is only a rough indication for analytics. For billing,
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
 * DeepSeek:         ~4.0 chars/token (conservative estimate)
 *
 * CONTEXT WINDOW LIMITS
 * ----------------------
 * Values here reflect published context windows as of 2026-08-01.
 * Update this table when providers announce new limits.
 */

import { getModelsForProvider } from '@/lib/model-catalog'
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
  deepseek: 4.0,
  // Fallback for unknown providers
  default: 4.0,
}

// ---------------------------------------------------------------------------
// Context window limits by provider and model
// ---------------------------------------------------------------------------

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
  const entries = getModelsForProvider(provider.toLowerCase())
  const modelLower = model.toLowerCase()
  const match = entries.find(entry => entry.id.toLowerCase() === modelLower)
    ?? [...entries].sort((a, b) => b.id.length - a.id.length).find(entry => new RegExp('^' + entry.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-[0-9]{4}-[0-9]{2}-[0-9]{2}$', 'i').test(model))
  if (match) return match.contextWindow
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
