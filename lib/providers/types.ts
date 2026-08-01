/**
 * Shared types for the unified provider runtime.
 *
 * Every provider adapter and both API routes (/api/llm/chat, /api/llm/stream)
 * reference these types so that request/response contracts stay consistent.
 */

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderRequest {
  messages: ProviderMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  /** Opaque userId propagated for logging / analytics; never sent upstream. */
  userId?: string
}

// ---------------------------------------------------------------------------
// Response (non-streaming)
// ---------------------------------------------------------------------------

export interface ProviderUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface ChatCompletion {
  content: string
  finish_reason: string
  usage?: ProviderUsage
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ProviderAdapterConfig {
  apiKey: string
  baseUrl?: string
  extraHeaders?: Record<string, string>
}

export interface ProviderAdapter {
  readonly id: string

  /**
   * Lightweight credential probe used by configuration flows.
   * Should not generate completions/billable usage where avoidable.
   */
  testConnection?(
    config: ProviderAdapterConfig,
  ): Promise<void>

  chat(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): Promise<ChatCompletion>

  stream(
    request: ProviderRequest,
    config: ProviderAdapterConfig,
  ): AsyncGenerator<string, void, undefined>
}

// ---------------------------------------------------------------------------
// Classified error shape (HTTP-level)
// ---------------------------------------------------------------------------

export interface ClassifiedError {
  status: number
  code: string
  error: string
}

// ---------------------------------------------------------------------------
// Provider IDs (literal union derived from registry)
// ---------------------------------------------------------------------------

export type ProviderId =
  | 'openai'
  | 'openrouter'
  | 'anthropic'
  | 'googleai'
  | 'grok'
  | 'ollama'
  | 'mistral'
  | 'kimi'
