import { describe, expect, it } from 'vitest'
import { conversationCursor, parseConversationPage } from '@/lib/conversation-pagination'
describe('history pagination input', () => {
  it('round trips opaque cursors and filters known workspace prefixes', () => {
    const cursor = conversationCursor({ id: 'conversation', updatedAt: '2026-09-08T00:00:00.000Z' })
    expect(parseConversationPage(new URLSearchParams({ cursor, limit: '25', workspace: 'pipeline' }))).toEqual({ limit: 25, prefix: 'Pipeline:', cursor: { id: 'conversation', updatedAt: '2026-09-08T00:00:00.000Z' } })
  })
  it.each(['limit=0', 'limit=101', 'limit=abc', 'cursor=invalid', 'workspace=secret'])('rejects invalid page input %s', query => {
    expect(() => parseConversationPage(new URLSearchParams(query))).toThrow()
  })
})
