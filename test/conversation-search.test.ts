import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_CONVERSATION_SEARCH_LENGTH,
  parseConversationPage,
  parseConversationSearch,
} from '@/lib/conversation-pagination'

type PrismaMock = {
  conversation: { findMany: ReturnType<typeof vi.fn> }
  message: { findMany: ReturnType<typeof vi.fn> }
}

const loadService = async (prismaMock: PrismaMock) => {
  vi.doMock('@/lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }))
  const mod = await import('@/services/conversation-service.db')
  return mod.ConversationService
}

const makePrismaMock = (
  conversations: unknown[] = [],
  messages: unknown[] = [],
): PrismaMock => ({
  conversation: { findMany: vi.fn().mockResolvedValue(conversations) },
  message: { findMany: vi.fn().mockResolvedValue(messages) },
})

const conversation = (id: string, title = `Title ${id}`) => ({
  id,
  title,
  userId: 'user-1',
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
})

const params = (query: string) => new URLSearchParams(query)

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('@/lib/prisma')
})

describe('parseConversationSearch', () => {
  it('returns undefined for an absent or blank term', () => {
    expect(parseConversationSearch(null)).toBeUndefined()
    expect(parseConversationSearch('')).toBeUndefined()
    expect(parseConversationSearch('    ')).toBeUndefined()
    expect(parseConversationSearch('\t\n ')).toBeUndefined()
  })

  it('trims and collapses internal whitespace', () => {
    expect(parseConversationSearch('  pricing   brief  ')).toBe('pricing brief')
    expect(parseConversationSearch('a\t\tb')).toBe('a b')
  })

  it('preserves characters that are special to SQL LIKE', () => {
    // The term is only ever passed as a Prisma `contains` parameter, so these
    // need no escaping here and must survive verbatim.
    expect(parseConversationSearch("100% margin")).toBe('100% margin')
    expect(parseConversationSearch("o'brien_v2")).toBe("o'brien_v2")
    expect(parseConversationSearch('a; DROP TABLE "Conversation"')).toBe(
      'a; DROP TABLE "Conversation"',
    )
  })

  it('rejects an over-long term', () => {
    const term = 'x'.repeat(MAX_CONVERSATION_SEARCH_LENGTH + 1)
    expect(() => parseConversationSearch(term)).toThrow(/too long/i)
  })

  it('accepts a term at exactly the limit', () => {
    const term = 'x'.repeat(MAX_CONVERSATION_SEARCH_LENGTH)
    expect(parseConversationSearch(term)).toBe(term)
  })
})

describe('parseConversationPage with search', () => {
  it('carries the search term alongside the existing page contract', () => {
    const page = parseConversationPage(params('limit=10&workspace=pipeline&q=brief'))
    expect(page).toMatchObject({
      limit: 10,
      prefix: 'Pipeline:',
      search: 'brief',
    })
  })

  it('leaves search undefined when q is absent', () => {
    expect(parseConversationPage(params('limit=10')).search).toBeUndefined()
  })

  it('still rejects an invalid limit or workspace', () => {
    expect(() => parseConversationPage(params('limit=0&q=x'))).toThrow(/invalid history page/i)
    expect(() => parseConversationPage(params('limit=101&q=x'))).toThrow(/invalid history page/i)
    expect(() => parseConversationPage(params('workspace=nope&q=x'))).toThrow(
      /invalid history page/i,
    )
  })

  it('still rejects a malformed cursor', () => {
    expect(() => parseConversationPage(params('cursor=not-base64&q=x'))).toThrow(
      /invalid history cursor/i,
    )
  })
})

describe('ConversationService.getConversationPage search', () => {
  it('leaves the unsearched query shape unchanged', async () => {
    const prismaMock = makePrismaMock([conversation('c1')])
    const service = await loadService(prismaMock)

    const result = await service.getConversationPage(
      'user-1',
      parseConversationPage(params('limit=30')),
    )

    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where).toEqual({ userId: 'user-1' })
    expect(prismaMock.message.findMany).not.toHaveBeenCalled()
    expect(result.items).toHaveLength(1)
    expect(result).not.toHaveProperty('search')
  })

  it('matches on title or on message content', async () => {
    const prismaMock = makePrismaMock(
      [conversation('c1')],
      [{ conversationId: 'c2' }, { conversationId: 'c3' }],
    )
    const service = await loadService(prismaMock)

    await service.getConversationPage(
      'user-1',
      parseConversationPage(params('limit=30&q=pricing')),
    )

    const messageArgs = prismaMock.message.findMany.mock.calls[0][0]
    expect(messageArgs.where).toMatchObject({
      content: { contains: 'pricing', mode: 'insensitive' },
      conversation: { userId: 'user-1' },
    })
    expect(messageArgs.distinct).toEqual(['conversationId'])

    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where.userId).toBe('user-1')
    expect(where.AND[0].OR).toEqual([
      { title: { contains: 'pricing', mode: 'insensitive' } },
      { id: { in: ['c2', 'c3'] } },
    ])
  })

  it('scopes the message arm to the owner, never across users', async () => {
    const prismaMock = makePrismaMock([], [{ conversationId: 'c9' }])
    const service = await loadService(prismaMock)

    await service.getConversationPage(
      'user-1',
      parseConversationPage(params('q=secret')),
    )

    expect(prismaMock.message.findMany.mock.calls[0][0].where.conversation).toEqual({
      userId: 'user-1',
    })
    expect(prismaMock.conversation.findMany.mock.calls[0][0].where.userId).toBe('user-1')
  })

  it('bounds the matched-id lookup', async () => {
    const prismaMock = makePrismaMock([], [])
    const service = await loadService(prismaMock)
    const { MAX_SEARCH_MATCH_CONVERSATIONS } = await import(
      '@/services/conversation-service.db'
    )

    await service.getConversationPage('user-1', parseConversationPage(params('q=a')))

    expect(prismaMock.message.findMany.mock.calls[0][0].take).toBe(
      MAX_SEARCH_MATCH_CONVERSATIONS,
    )
  })

  it('falls back to a title-only match when no message matches', async () => {
    const prismaMock = makePrismaMock([conversation('c1', 'Pricing brief')], [])
    const service = await loadService(prismaMock)

    await service.getConversationPage(
      'user-1',
      parseConversationPage(params('q=pricing')),
    )

    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where.AND[0].OR).toEqual([
      { title: { contains: 'pricing', mode: 'insensitive' } },
    ])
  })

  it('keeps the workspace prefix filter while searching', async () => {
    const prismaMock = makePrismaMock([], [{ conversationId: 'c2' }])
    const service = await loadService(prismaMock)

    await service.getConversationPage(
      'user-1',
      parseConversationPage(params('workspace=roundtable&q=brief')),
    )

    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where.title).toEqual({ startsWith: 'Roundtable:' })
    expect(where.AND[0].OR).toContainEqual({ id: { in: ['c2'] } })
  })

  it('keeps the keyset cursor while searching', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ id: 'c5', updatedAt: '2026-03-01T00:00:00.000Z' }),
    ).toString('base64url')
    const prismaMock = makePrismaMock([], [])
    const service = await loadService(prismaMock)

    await service.getConversationPage(
      'user-1',
      parseConversationPage(params(`q=brief&cursor=${cursor}`)),
    )

    const where = prismaMock.conversation.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { updatedAt: { lt: new Date('2026-03-01T00:00:00.000Z') } },
      { updatedAt: new Date('2026-03-01T00:00:00.000Z'), id: { lt: 'c5' } },
    ])
  })

  it('paginates search results with a next cursor', async () => {
    const items = Array.from({ length: 3 }, (_, index) =>
      conversation(`c${index}`),
    )
    const prismaMock = makePrismaMock(items, [])
    const service = await loadService(prismaMock)

    const result = await service.getConversationPage(
      'user-1',
      parseConversationPage(params('limit=2&q=brief')),
    )

    expect(prismaMock.conversation.findMany.mock.calls[0][0].take).toBe(3)
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeTypeOf('string')
    expect(result.search).toBe('brief')
  })

  it('returns no next cursor on the final page of results', async () => {
    const prismaMock = makePrismaMock([conversation('c1')], [])
    const service = await loadService(prismaMock)

    const result = await service.getConversationPage(
      'user-1',
      parseConversationPage(params('limit=2&q=brief')),
    )

    expect(result.nextCursor).toBeNull()
  })

  it('orders results newest-first, as the unsearched listing does', async () => {
    const prismaMock = makePrismaMock([], [])
    const service = await loadService(prismaMock)

    await service.getConversationPage('user-1', parseConversationPage(params('q=brief')))

    expect(prismaMock.conversation.findMany.mock.calls[0][0].orderBy).toEqual([
      { updatedAt: 'desc' },
      { id: 'desc' },
    ])
  })

  it('passes a term with LIKE metacharacters through as a parameter', async () => {
    const prismaMock = makePrismaMock([], [])
    const service = await loadService(prismaMock)

    await service.getConversationPage(
      'user-1',
      parseConversationPage(
        new URLSearchParams([['q', "100% o'brien_v2"]]),
      ),
    )

    expect(prismaMock.message.findMany.mock.calls[0][0].where.content).toEqual({
      contains: "100% o'brien_v2",
      mode: 'insensitive',
    })
  })
})
