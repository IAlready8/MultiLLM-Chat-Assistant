// Lightweight schemas for LLM routes
// If Zod is installed, we can replace these with zod; for now, use manual checks.

export interface ChatMessageSchema {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatRequestSchema {
  provider: string
  messages: ChatMessageSchema[]
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
}

export function validateChatRequest(body: any): { ok: true; data: ChatRequestSchema } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid JSON body' }
  const { provider, messages, options } = body
  if (!provider || typeof provider !== 'string') return { ok: false, error: 'provider is required' }
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: 'messages must be a non-empty array' }
  for (const m of messages) {
    if (!m || typeof m !== 'object') return { ok: false, error: 'each message must be an object' }
    if (!['user', 'assistant', 'system'].includes(m.role)) return { ok: false, error: 'invalid message role' }
    if (typeof m.content !== 'string') return { ok: false, error: 'message content must be string' }
  }
  if (options && typeof options !== 'object') return { ok: false, error: 'options must be object if provided' }
  return { ok: true, data: { provider, messages, options } }
}