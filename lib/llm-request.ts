import { z } from 'zod'

export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'VALIDATION_ERROR',
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'LlmRequestError'
  }
}

export const MAX_LLM_BODY_BYTES = 1_048_576

export async function readBoundedText(request: Pick<Request, 'headers' | 'body'>, limit = MAX_LLM_BODY_BYTES): Promise<string> {
  if (Number(request.headers.get('content-length')) > limit) {
    throw new LlmRequestError('Request body is too large', 413, 'REQUEST_TOO_LARGE')
  }
  const reader = request.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let length = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) {
        await reader.cancel()
        throw new LlmRequestError('Request body is too large', 413, 'REQUEST_TOO_LARGE')
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return body
  } finally {
    reader.releaseLock()
  }
}

export async function readBoundedJson(request: Pick<Request, 'headers' | 'body'>, limit = MAX_LLM_BODY_BYTES): Promise<unknown> {
  const body = await readBoundedText(request, limit)
  try { return JSON.parse(body) } catch { throw new LlmRequestError('Request body must be valid JSON', 400, 'INVALID_JSON') }
}

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(128_000),
})

const generationFields = {
  provider: z.string().trim().min(1).max(64).transform(value => value.toLowerCase()),
  model: z.string().trim().min(1).max(256).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(65_536).optional(),
  reasoning_effort: z.enum(['off', 'low', 'high', 'max']).optional(),
  stream: z.boolean().optional(),
  conversationId: z.string().min(1).max(128).optional(),
  requestId: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
  instanceId: z.string().max(128).optional(),
  position: z.number().int().min(0).max(7).optional(),
}

export const llmRequestSchema = z.object({
  ...generationFields,
  messages: z.array(chatMessageSchema).min(1).max(200),
})

export type LlmInput = z.infer<typeof llmRequestSchema>

// Saved multi-model chat asks the server to rebuild model context from the
// owned conversation instead of trusting browser-loaded (possibly paginated)
// history. The client supplies identities only.
const serverHistorySchema = z.object({
  ...generationFields,
  history: z.literal('server'),
  model: z.string().trim().min(1).max(256),
  conversationId: z.string().min(1).max(128),
  requestId: z.string().uuid(),
  turnId: z.string().uuid(),
})

export type ServerHistoryInput = z.infer<typeof serverHistorySchema>
export type GenerationInput = LlmInput | ServerHistoryInput

export function usesServerHistory(input: GenerationInput): input is ServerHistoryInput {
  return 'history' in input && input.history === 'server'
}

function assertObjectWithSupportedCapabilities(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LlmRequestError('Request body must be an object')
  }
  const input = value as Record<string, unknown>
  if (['tools', 'tool_choice', 'response_format', 'attachments', 'modalities'].some(key => input[key] !== undefined)) throw new LlmRequestError('Tools, structured output and attachments are not supported by this chat endpoint', 400, 'MODEL_CAPABILITY_UNSUPPORTED')
  if (input.reasoning_effort !== undefined && !['off', 'low', 'high', 'max'].includes(String(input.reasoning_effort))) {
    throw new LlmRequestError('reasoning_effort must be one of: off, low, high, max')
  }
  return input
}

export function parseLlmInput(value: unknown, defaultProvider?: string): LlmInput {
  const input = assertObjectWithSupportedCapabilities(value)
  if (input.history !== undefined && input.history !== 'client') {
    throw new LlmRequestError('Server-assembled history is only available for saved streaming generations', 400, 'HISTORY_MODE_UNSUPPORTED')
  }
  const provider = input.provider ?? defaultProvider
  if (typeof provider !== 'string' || !provider.trim() || !Array.isArray(input.messages) || !input.messages.length) {
    throw new LlmRequestError('Provider and messages are required')
  }
  const { history: _history, ...rest } = input
  void _history
  const result = llmRequestSchema.safeParse({ ...rest, provider })
  if (!result.success) throw new LlmRequestError('Invalid message or generation parameters')
  if (result.data.conversationId && (!result.data.requestId || !result.data.turnId)) throw new LlmRequestError('Saved generations require a request ID and user turn ID')
  return result.data
}

/** Streaming boundary: accepts client history or a saved server-history request. */
export function parseGenerationInput(value: unknown): GenerationInput {
  const input = assertObjectWithSupportedCapabilities(value)
  if (input.history !== 'server') return parseLlmInput(value)
  if (input.messages !== undefined) {
    throw new LlmRequestError('Omit messages when the server assembles conversation history', 400, 'HISTORY_MODE_CONFLICT')
  }
  const result = serverHistorySchema.safeParse(input)
  if (!result.success) throw new LlmRequestError('Server-assembled history requires provider, model, conversation, request and user turn IDs')
  return result.data
}
