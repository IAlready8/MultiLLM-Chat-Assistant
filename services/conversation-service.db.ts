import { orderConversationMessages, reconcileExpiredGenerations } from './generation-service'
import { prisma } from '@/lib/prisma'
import { conversationCursor, type parseConversationPage } from '@/lib/conversation-pagination'
import { Conversation, Message, PrismaClient } from '@/types/prisma'
import {
  createDbAvailabilityTracker,
  getOrCreateUserStore,
  isUserForeignKeyConstraintError,
} from '@/lib/db-fallback'

type ConversationWithMessages = Conversation & { messages: Message[] }
type NewMessageData = Omit<Message, 'id' | 'conversationId' | 'createdAt'>

type GlobalConversationFallback = typeof globalThis & {
  __multiLlmConversationFallbackStore?: Map<string, Map<string, ConversationWithMessages>>
}

const conversationGlobal = globalThis as GlobalConversationFallback

const fallbackConversations: Map<string, Map<string, ConversationWithMessages>> =
  conversationGlobal.__multiLlmConversationFallbackStore ??
  (conversationGlobal.__multiLlmConversationFallbackStore = new Map<
    string,
    Map<string, ConversationWithMessages>
  >())

const db = createDbAvailabilityTracker()

const getFallbackUserStore = (userId: string) =>
  getOrCreateUserStore(fallbackConversations, userId)

const peekFallbackUserStore = (userId: string) =>
  fallbackConversations.get(userId)

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const cloneConversation = (conversation: ConversationWithMessages): ConversationWithMessages => ({
  ...conversation,
  messages: orderConversationMessages(conversation.messages.map(message => ({ ...message }))),
})

const toConversation = (conversation: ConversationWithMessages): Conversation => {
  const { messages, ...metadata } = conversation
  return metadata
}

const countComparisonReadyFallbackConversations = (userId: string) =>
  Array.from(peekFallbackUserStore(userId)?.values() ?? []).filter(conversation =>
    conversation.messages.some(
      message => message.role === 'assistant' && Boolean(message.provider) && Boolean(message.content.trim()) && (!message.generationStatus || message.generationStatus === 'complete')
    )
  ).length

const countWeeklySavedBriefComparisonFallbackConversations = (
  userId: string,
  updatedSince: Date
) =>
  Array.from(peekFallbackUserStore(userId)?.values() ?? []).filter(
    conversation =>
      conversation.messages.some(
        message =>
          message.role === 'assistant' &&
          Boolean(message.content.trim()) &&
          (!message.generationStatus || message.generationStatus === 'complete') &&
          Boolean(message.provider) &&
          message.createdAt >= updatedSince
      )
  ).length

/**
 * This service provides all database operations for Conversations,
 * replacing the old client-side IndexedDB logic.
 */
export const ConversationService = {
  async getConversationPage(userId: string, page: ReturnType<typeof parseConversationPage>) {
    const date = page.cursor ? new Date(page.cursor.updatedAt) : undefined
    const items = await prisma.conversation.findMany({
      where: {
        userId,
        ...(page.prefix ? { title: { startsWith: page.prefix } } : {}),
        ...(page.cursor ? { OR: [{ updatedAt: { lt: date } }, { updatedAt: date, id: { lt: page.cursor.id } }] } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
    })
    const more = items.length > page.limit
    const visible = items.slice(0, page.limit)
    return { items: visible, nextCursor: more ? conversationCursor(visible[visible.length - 1]) : null }
  },
  async getComparisonReadyConversationCountByUserId(
    userId: string
  ): Promise<number> {
    const fallbackCount = countComparisonReadyFallbackConversations(userId)

    if (db.isKnownUnavailable()) {
      return fallbackCount
    }

    try {
      const dbConversationIds = await prisma.message.findMany({
        where: {
          role: 'assistant',
          generationStatus: 'complete',
          content: { not: '' },
          provider: {
            not: null,
          },
          conversation: {
            userId,
          },
        },
        distinct: ['conversationId'],
        select: {
          conversationId: true,
        },
      })

      if (!db.isFallbackAllowed()) {
        return dbConversationIds.length
      }

      return Math.max(dbConversationIds.length, fallbackCount)
    } catch (error) {
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce(
          'getComparisonReadyConversationCountByUserId',
          'conversation',
          error
        )
      }
      return fallbackCount
    }
  },

  async getWeeklySavedBriefComparisonCountByUserId(
    userId: string,
    updatedSince: Date
  ): Promise<number> {
    const fallbackCount = countWeeklySavedBriefComparisonFallbackConversations(
      userId,
      updatedSince
    )

    if (db.isKnownUnavailable()) {
      return fallbackCount
    }

    try {
      const dbConversationIds = await prisma.message.findMany({
        where: {
          createdAt: {
            gte: updatedSince,
          },
          role: 'assistant',
          generationStatus: 'complete',
          content: { not: '' },
          provider: {
            not: null,
          },
          conversation: {
            userId,
          },
        },
        distinct: ['conversationId'],
        select: {
          conversationId: true,
        },
      })

      if (!db.isFallbackAllowed()) {
        return dbConversationIds.length
      }

      return Math.max(dbConversationIds.length, fallbackCount)
    } catch (error) {
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce(
          'getWeeklySavedBriefComparisonCountByUserId',
          'conversation',
          error
        )
      }
      return fallbackCount
    }
  },

  async getWeeklySavedBriefComparisonCountForRollingDays(
    userId: string,
    days: number
  ): Promise<number> {
    const updatedSince = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return this.getWeeklySavedBriefComparisonCountByUserId(userId, updatedSince)
  },

  /**
   * Get all conversations (metadata only) for a user.
   */
  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    const listFallbackConversations = () =>
      Array.from(getFallbackUserStore(userId).values())
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map(toConversation)

    if (db.isKnownUnavailable()) {
      return listFallbackConversations()
    }

    try {
      const conversations = await prisma.conversation.findMany({
        where: {
          userId: userId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })
      if (!db.isFallbackAllowed()) {
        return conversations
      }

      const fallback = listFallbackConversations()
      if (fallback.length === 0) {
        return conversations
      }

      const merged = new Map<string, Conversation>()
      for (const conversation of fallback) {
        merged.set(conversation.id, conversation)
      }
      for (const conversation of conversations) {
        merged.set(conversation.id, conversation)
      }

      return Array.from(merged.values()).sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      )
    } catch (error) {
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getConversationsByUserId', 'conversation', error)
      }
      return listFallbackConversations()
    }
  },

  /**
   * Get a single, full conversation with all messages.
   */
  async getFullConversation(
    id: string,
    userId: string
  ): Promise<ConversationWithMessages | null> {
    if (db.isKnownUnavailable()) {
      const conversation = getFallbackUserStore(userId).get(id)
      return conversation ? cloneConversation(conversation) : null
    }

    try {
      await reconcileExpiredGenerations(userId, id)
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: id,
          userId: userId,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      })
      if (conversation) {
        return { ...conversation, messages: orderConversationMessages((conversation as ConversationWithMessages).messages) } as ConversationWithMessages
      }

      if (!db.isFallbackAllowed()) {
        return null
      }

      const fallbackConversation = getFallbackUserStore(userId).get(id)
      return fallbackConversation ? cloneConversation(fallbackConversation) : null
    } catch (error) {
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getFullConversation', 'conversation', error)
      }
      const conversation = getFallbackUserStore(userId).get(id)
      return conversation ? cloneConversation(conversation) : null
    }
  },

  /**
   * Create a new conversation with its first messages.
   */
  async createConversation(
    userId: string,
    title: string,
    messagesData: NewMessageData[]
  ): Promise<Conversation> {
    const saveToFallback = () => {
      const now = new Date()
      const conversationId = createId('conversation')
      const messages = messagesData.map((message, index) => ({
        id: createId('message'),
        conversationId,
        createdAt: new Date(now.getTime() + index),
        role: message.role,
        content: message.content,
        provider: message.provider ?? null,
        model: message.model ?? null,
        clientId: message.clientId ?? null,
        instanceId: message.instanceId ?? null,
      }))

      const conversation: ConversationWithMessages = {
        id: conversationId,
        userId,
        title,
        createdAt: now,
        updatedAt: now,
        messages,
      }

      getFallbackUserStore(userId).set(conversationId, conversation)
      return toConversation(conversation)
    }

    if (db.isKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      return await prisma.conversation.create({
        data: {
          userId: userId,
          title: title,
          messages: {
            create: messagesData,
          },
        },
      })
    } catch (error) {
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      const userForeignKeyError = isUserForeignKeyConstraintError(error)
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!dbUnavailable && userForeignKeyError) {
        db.logWarningOnce('createConversation', 'conversation', error)
      } else if (!dbUnavailable) {
        throw error
      }
      return saveToFallback()
    }
  },

  /**
   * Add messages to an existing conversation.
   */
  async addMessages(
    id: string,
    userId: string,
    messagesData: NewMessageData[]
  ): Promise<ConversationWithMessages | null> {
    const saveToFallback = () => {
      const store = getFallbackUserStore(userId)
      const existingConversation = store.get(id)
      if (!existingConversation) {
        return null
      }

      const now = new Date()
      const newMessages: Message[] = messagesData.map((message, index) => ({
        id: createId('message'),
        conversationId: id,
        createdAt: new Date(now.getTime() + index),
        role: message.role,
        content: message.content,
        provider: message.provider ?? null,
        model: message.model ?? null,
        clientId: message.clientId ?? null,
        instanceId: message.instanceId ?? null,
      }))

      const updatedConversation: ConversationWithMessages = {
        ...existingConversation,
        updatedAt: now,
        messages: [...existingConversation.messages, ...newMessages],
      }

      store.set(id, updatedConversation)
      return cloneConversation(updatedConversation)
    }

    if (db.isKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      // Verify user owns the conversation
      const conversation = await prisma.conversation.findFirst({
        where: { id: id, userId: userId },
      })

      if (!conversation) {
        return null // Not found or not authorized
      }

      // Nested createMany preserves the unique per-conversation client ID on retries.
      await prisma.conversation.update({
        where: { id: id, userId },
        data: {
          updatedAt: new Date(),
          messages: messagesData.some(message => message.clientId)
            ? { createMany: { data: messagesData, skipDuplicates: true } }
            : { create: messagesData },
        },
      })

      return this.getFullConversation(id, userId)
    } catch (error) {
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      const userForeignKeyError = isUserForeignKeyConstraintError(error)
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!dbUnavailable && userForeignKeyError) {
        db.logWarningOnce('addMessages', 'conversation', error)
      } else if (!dbUnavailable) {
        throw error
      }
      return saveToFallback()
    }
  },

  /**
   * Update an existing conversation title.
   */
  async updateConversationTitle(
    id: string,
    userId: string,
    title: string
  ): Promise<Conversation | null> {
    const saveToFallback = () => {
      const store = getFallbackUserStore(userId)
      const existingConversation = store.get(id)
      if (!existingConversation) {
        return null
      }

      const updatedConversation: ConversationWithMessages = {
        ...existingConversation,
        title,
        updatedAt: new Date(),
      }

      store.set(id, updatedConversation)
      return toConversation(updatedConversation)
    }

    if (db.isKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          id,
          userId,
        },
      })

      if (!existingConversation) {
        return db.isFallbackAllowed() ? saveToFallback() : null
      }

      return await prisma.conversation.update({
        where: { id },
        data: {
          title,
          updatedAt: new Date(),
        },
      })
    } catch (error) {
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!dbUnavailable) {
        throw error
      }
      return saveToFallback()
    }
  },
  
  /**
   * Delete a conversation and all its messages.
   */
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    if (db.isKnownUnavailable()) {
      return getFallbackUserStore(userId).delete(id)
    }

    try {
      // Use a transaction to delete messages and conversation
      return await prisma.$transaction(async (tx: PrismaClient) => {
        // Verify ownership
        const conversation = await tx.conversation.findFirst({
          where: { id: id, userId: userId },
        })
        if (!conversation) {
          return false
        }
        
        // 1. Delete messages
        await tx.message.deleteMany({
          where: { conversationId: id },
        })
        
        // 2. Delete conversation
        await tx.conversation.delete({
          where: { id: id, userId: userId },
        })
        return true
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') return false
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      const userForeignKeyError = isUserForeignKeyConstraintError(error)
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!dbUnavailable && userForeignKeyError) {
        db.logWarningOnce('deleteConversation', 'conversation', error)
      } else if (!dbUnavailable) {
        throw error
      }
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
