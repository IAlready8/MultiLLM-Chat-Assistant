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

type ConversationRecord = {
  id: string
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

type MessageRecord = {
  id: string
  conversationId: string
  role: string
  content: string
  provider: string | null
  model: string | null
  createdAt: Date
}

const makeStatefulPrismaMock = (): PrismaMock => {
  const state = {
    conversations: [] as ConversationRecord[],
    messages: [] as MessageRecord[],
    conversationCounter: 0,
    messageCounter: 0,
  }

  const toConversation = (record: ConversationRecord) => ({ ...record })

  const findConversation = (id: string, userId?: string) =>
    state.conversations.find(
      conversation =>
        conversation.id === id && (userId ? conversation.userId === userId : true)
    ) ?? null

  const conversation = {
    findMany: vi.fn().mockImplementation(async ({ where }: { where: { userId: string } }) =>
      state.conversations
        .filter(item => item.userId === where.userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map(toConversation)
    ),
    findFirst: vi.fn().mockImplementation(async ({ where, include }: {
      where: { id?: string; userId?: string }
      include?: { messages?: { orderBy?: { createdAt: 'asc' | 'desc' } } }
    }) => {
      const conversationRecord = state.conversations.find(item => {
        if (where.id && item.id !== where.id) return false
        if (where.userId && item.userId !== where.userId) return false
        return true
      })

      if (!conversationRecord) {
        return null
      }

      if (include?.messages) {
        const direction = include.messages.orderBy?.createdAt ?? 'asc'
        const messages = state.messages
          .filter(message => message.conversationId === conversationRecord.id)
          .sort((a, b) =>
            direction === 'asc'
              ? a.createdAt.getTime() - b.createdAt.getTime()
              : b.createdAt.getTime() - a.createdAt.getTime()
          )
          .map(message => ({ ...message }))

        return {
          ...toConversation(conversationRecord),
          messages,
        }
      }

      return toConversation(conversationRecord)
    }),
    create: vi.fn().mockImplementation(async ({ data }: {
      data: {
        userId: string
        title: string
        messages: {
          create: Array<{
            role: string
            content: string
            provider?: string | null
            model?: string | null
          }>
        }
      }
    }) => {
      const now = new Date()
      const id = `conv-${++state.conversationCounter}`
      const conversationRecord: ConversationRecord = {
        id,
        userId: data.userId,
        title: data.title,
        createdAt: now,
        updatedAt: now,
      }
      state.conversations.push(conversationRecord)

      for (const message of data.messages.create) {
        state.messages.push({
          id: `msg-${++state.messageCounter}`,
          conversationId: id,
          role: message.role,
          content: message.content,
          provider: message.provider ?? null,
          model: message.model ?? null,
          createdAt: new Date(),
        })
      }

      return toConversation(conversationRecord)
    }),
    update: vi.fn().mockImplementation(async ({ where, data }: {
      where: { id: string }
      data: {
        title?: string
        updatedAt?: Date
        messages?: {
          create: Array<{
            role: string
            content: string
            provider?: string | null
            model?: string | null
          }>
        }
      }
    }) => {
      const existing = findConversation(where.id)
      if (!existing) {
        throw new Error('Conversation not found')
      }

      if (typeof data.title === 'string') {
        existing.title = data.title
      }
      if (data.updatedAt instanceof Date) {
        existing.updatedAt = data.updatedAt
      } else {
        existing.updatedAt = new Date()
      }

      if (data.messages?.create) {
        for (const message of data.messages.create) {
          state.messages.push({
            id: `msg-${++state.messageCounter}`,
            conversationId: existing.id,
            role: message.role,
            content: message.content,
            provider: message.provider ?? null,
            model: message.model ?? null,
            createdAt: new Date(),
          })
        }
      }

      return toConversation(existing)
    }),
    delete: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
      const existing = findConversation(where.id)
      if (!existing) {
        throw new Error('Conversation not found')
      }

      state.conversations = state.conversations.filter(item => item.id !== where.id)
      state.messages = state.messages.filter(
        message => message.conversationId !== where.id
      )

      return toConversation(existing)
    }),
  }

  const message = {
    deleteMany: vi.fn().mockImplementation(async ({ where }: { where: { conversationId: string } }) => {
      const before = state.messages.length
      state.messages = state.messages.filter(
        item => item.conversationId !== where.conversationId
      )
      return { count: before - state.messages.length }
    }),
  }

  const tx = {
    conversation: {
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { id: string; userId: string } }) =>
        findConversation(where.id, where.userId)
      ),
      delete: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
        conversation.delete({ where })
      ),
    },
    message: {
      deleteMany: vi.fn().mockImplementation(async ({ where }: { where: { conversationId: string } }) =>
        message.deleteMany({ where })
      ),
    },
  }

  const $transaction = vi.fn().mockImplementation(
    async (fn: (client: {
      conversation: {
        findFirst: typeof tx.conversation.findFirst
        delete: typeof tx.conversation.delete
      }
      message: {
        deleteMany: typeof tx.message.deleteMany
      }
    }) => Promise<unknown>) => fn(tx)
  )

  return {
    conversation,
    message,
    $transaction,
  }
}

const loadService = async () => {
  const prismaMock = makePrismaMock()
  vi.doMock('@/lib/prisma', () => ({ prisma: prismaMock }))
  const mod = await import('@/services/conversation-service.db')
  return { ConversationService: mod.ConversationService, prismaMock }
}

const loadServiceWithPrismaMock = async (prismaMock: PrismaMock) => {
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

    const renamed = await ConversationService.updateConversationTitle(
      created.id,
      'user-1',
      'Renamed Chat'
    )
    expect(renamed?.title).toBe('Renamed Chat')

    const renamedList = await ConversationService.getConversationsByUserId('user-1')
    expect(renamedList[0]?.title).toBe('Renamed Chat')

    const deleted = await ConversationService.deleteConversation(created.id, 'user-1')
    expect(deleted).toBe(true)

    const afterDelete = await ConversationService.getConversationsByUserId('user-1')
    expect(afterDelete).toHaveLength(0)
  })

  it('persists conversation lifecycle across service reinitialization in DB-backed mode', async () => {
    const prismaMock = makeStatefulPrismaMock()
    const initialLoad = await loadServiceWithPrismaMock(prismaMock)

    const created = await initialLoad.ConversationService.createConversation(
      'user-1',
      'Initial title',
      [
        {
          role: 'user',
          content: 'first message',
          provider: null,
          model: null,
        },
      ]
    )

    const renamed = await initialLoad.ConversationService.updateConversationTitle(
      created.id,
      'user-1',
      'Renamed title'
    )
    expect(renamed?.title).toBe('Renamed title')

    const appended = await initialLoad.ConversationService.addMessages(
      created.id,
      'user-1',
      [
        {
          role: 'assistant',
          content: 'second message',
          provider: 'openai',
          model: 'gpt-4',
        },
      ]
    )
    expect(appended?.messages).toHaveLength(2)

    vi.resetModules()
    const afterRefresh = await loadServiceWithPrismaMock(prismaMock)

    const listAfterRefresh =
      await afterRefresh.ConversationService.getConversationsByUserId('user-1')
    expect(listAfterRefresh).toHaveLength(1)
    expect(listAfterRefresh[0]?.title).toBe('Renamed title')

    const fullAfterRefresh = await afterRefresh.ConversationService.getFullConversation(
      created.id,
      'user-1'
    )
    expect(fullAfterRefresh?.messages).toHaveLength(2)
    expect(fullAfterRefresh?.messages[0]?.content).toBe('first message')
    expect(fullAfterRefresh?.messages[1]?.content).toBe('second message')

    const deleted = await afterRefresh.ConversationService.deleteConversation(
      created.id,
      'user-1'
    )
    expect(deleted).toBe(true)

    const listAfterDelete =
      await afterRefresh.ConversationService.getConversationsByUserId('user-1')
    expect(listAfterDelete).toHaveLength(0)
  })

  it('renames fallback conversations when DB reads recover but the row is absent', async () => {
    const unavailableService = await loadService()

    const created = await unavailableService.ConversationService.createConversation(
      'user-1',
      'Fallback title',
      [
        {
          role: 'user',
          content: 'hello',
          provider: null,
          model: null,
        },
      ]
    )

    vi.resetModules()

    const prismaMock: PrismaMock = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      message: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    }

    const recoveredService = await loadServiceWithPrismaMock(prismaMock)

    const renamed = await recoveredService.ConversationService.updateConversationTitle(
      created.id,
      'user-1',
      'Recovered fallback title'
    )

    expect(renamed?.title).toBe('Recovered fallback title')

    const list = await recoveredService.ConversationService.getConversationsByUserId(
      'user-1'
    )
    expect(list[0]?.title).toBe('Recovered fallback title')
  })

  it('throws unexpected write errors instead of silently falling back', async () => {
    const unexpectedError = new Error('Unexpected conversation write failure')

    const prismaMock: PrismaMock = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(unexpectedError),
        update: vi.fn(),
        delete: vi.fn(),
      },
      message: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    }

    const { ConversationService } = await loadServiceWithPrismaMock(prismaMock)

    await expect(
      ConversationService.createConversation('user-1', 'Should fail', [
        {
          role: 'user',
          content: 'hello',
          provider: null,
          model: null,
        },
      ])
    ).rejects.toThrow('Unexpected conversation write failure')
  })

  it('fails closed in production for guest FK fallback paths', async () => {
    const env = process.env as Record<string, string | undefined>
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'

    try {
      const fkConstraintError = new Error(
        'Foreign key constraint failed on the field: Conversation_userId_fkey'
      )

      const prismaMock: PrismaMock = {
        conversation: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue(fkConstraintError),
          update: vi.fn(),
          delete: vi.fn(),
        },
        message: {
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn(),
      }

      const { ConversationService } = await loadServiceWithPrismaMock(prismaMock)

      await expect(
        ConversationService.createConversation('guest-local-user', 'Should fail', [
          {
            role: 'user',
            content: 'hello',
            provider: null,
            model: null,
          },
        ])
      ).rejects.toThrow('Foreign key constraint failed')
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })
})
