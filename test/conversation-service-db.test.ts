import { beforeEach, describe, expect, it, vi } from 'vitest'

const DB_UNAVAILABLE_ERROR = new Error(
  'Database access for conversation is not available in this environment.'
)

type PrismaMock = {
  conversation: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  message: {
    deleteMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

const makePrismaMock = (): PrismaMock => ({
  conversation: {
    findMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    findFirst: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    create: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    update: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    delete: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
  },
  message: {
    deleteMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
  },
  $transaction: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
})

const loadService = async () => {
  const prismaMock = makePrismaMock()
  vi.doMock('@/lib/prisma', () => ({ prisma: prismaMock }))
  const mod = await import('@/services/conversation-service.db')
  return { ConversationService: mod.ConversationService, prismaMock }
}

describe('ConversationService DB fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __multiLlmConversationFallbackStore?: unknown })
      .__multiLlmConversationFallbackStore
  })

  it('creates, reads, updates, and deletes via in-memory fallback when DB is unavailable', async () => {
    const { ConversationService } = await loadService()

    const created = await ConversationService.createConversation('user-1', 'Test Chat', [
      {
        role: 'user',
        content: 'hello',
        provider: null,
        model: null,
      },
    ])

    expect(created.userId).toBe('user-1')
    expect(created.title).toBe('Test Chat')

    const list = await ConversationService.getConversationsByUserId('user-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const full = await ConversationService.getFullConversation(created.id, 'user-1')
    expect(full?.messages).toHaveLength(1)
    expect(full?.messages[0].content).toBe('hello')

    const updated = await ConversationService.addMessages(created.id, 'user-1', [
      {
        role: 'assistant',
        content: 'hi there',
        provider: 'openai',
        model: 'gpt-4',
      },
    ])
    expect(updated?.messages).toHaveLength(2)

    const deleted = await ConversationService.deleteConversation(created.id, 'user-1')
    expect(deleted).toBe(true)

    const afterDelete = await ConversationService.getConversationsByUserId('user-1')
    expect(afterDelete).toHaveLength(0)
  })
})
