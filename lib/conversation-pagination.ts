import { z } from 'zod'
import { LlmRequestError } from '@/lib/llm-request'

const cursorSchema = z.object({ id: z.string().min(1).max(128), updatedAt: z.string().datetime() }).strict()
export function parseConversationPage(params: URLSearchParams) {
  const limit = Number(params.get('limit') ?? 30)
  const workspace = params.get('workspace') ?? 'all'
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !['all', 'pipeline', 'roundtable'].includes(workspace)) throw new LlmRequestError('Invalid history page')
  let cursor: z.infer<typeof cursorSchema> | undefined
  const raw = params.get('cursor')
  if (raw) {
    try {
      if (raw.length > 1024) throw new Error('Cursor too long')
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    } catch { throw new LlmRequestError('Invalid history cursor') }
  }
  return { limit, cursor, prefix: workspace === 'pipeline' ? 'Pipeline:' : workspace === 'roundtable' ? 'Roundtable:' : undefined }
}

export function conversationCursor(item: { id: string; updatedAt: Date | string }) {
  return Buffer.from(JSON.stringify({ id: item.id, updatedAt: new Date(item.updatedAt).toISOString() })).toString('base64url')
}
