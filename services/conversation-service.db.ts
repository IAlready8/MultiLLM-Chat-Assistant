import { prisma } from '@/lib/prisma'
import { Conversation, Message, PrismaClient } from '@/types/prisma'

type ConversationWithMessages = Conversation & { messages: Message[] }
type NewMessageData = Omit<Message, 'id' | 'conversationId' | 'createdAt'>

const fallbackConversations = new Map<string, Map<string, ConversationWithMessages>>()
const fallbackWarnings = new Set<string>()

const logFallbackWarning = (scope: string, error: unknown) => {
  if (fallbackWarnings.has(scope)) {
    return
  }
  fallbackWarnings.add(scope)
  console.warn('Falling back to in-memory conversation store:', error)
}

const getFallbackUserStore = (userId: string) => {
  let store = fallbackConversations.get(userId)
  if (!store) {
    store = new Map<string, ConversationWithMessages>()
    fallbackConversations.set(userId, store)
  }
  return store
}

const createId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const cloneConversation = (conversation: ConversationWithMessages): ConversationWithMessages => ({
  ...conversation,
  messages: conversation.messages.map(message => ({ ...message })),
})

const toConversation = (conversation: ConversationWithMessages): Conversation => {
  const { messages, ...metadata } = conversation
  return metadata
}

/**
 * This service provides all database operations for Conversations,
 * replacing the old client-side IndexedDB logic.
 */
export const ConversationService = {
  /**
   * Get all conversations (metadata only) for a user.
   */
  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    try {
      return await prisma.conversation.findMany({
        where: {
          userId: userId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })
    } catch (error) {
      logFallbackWarning('getConversationsByUserId', error)
      return Array.from(getFallbackUserStore(userId).values())
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map(toConversation)
    }
  },

  /**
   * Get a single, full conversation with all messages.
   */
  async getFullConversation(
    id: string,
    userId: string
  ): Promise<ConversationWithMessages | null> {
    try {
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
      return conversation as unknown as ConversationWithMessages | null
    } catch (error) {
      logFallbackWarning('getFullConversation', error)
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
      logFallbackWarning('createConversation', error)
      const now = new Date()
      const conversationId = createId('conversation')
      const messages = messagesData.map((message) => ({
        id: createId('message'),
        conversationId,
        createdAt: now,
        role: message.role,
        content: message.content,
        provider: message.provider ?? null,
        model: message.model ?? null,
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
  },

  /**
   * Add messages to an existing conversation.
   */
  async addMessages(
    id: string,
    userId: string,
    messagesData: NewMessageData[]
  ): Promise<ConversationWithMessages | null> {
    try {
      // Verify user owns the conversation
      const conversation = await prisma.conversation.findFirst({
        where: { id: id, userId: userId },
      })

      if (!conversation) {
        return null // Not found or not authorized
      }

      // Add messages and update the conversation's updatedAt timestamp
      await prisma.conversation.update({
        where: { id: id },
        data: {
          updatedAt: new Date(),
          messages: {
            create: messagesData,
          },
        },
      })

      return this.getFullConversation(id, userId)
    } catch (error) {
      logFallbackWarning('addMessages', error)
      const store = getFallbackUserStore(userId)
      const existingConversation = store.get(id)
      if (!existingConversation) {
        return null
      }

      const now = new Date()
      const newMessages: Message[] = messagesData.map((message) => ({
        id: createId('message'),
        conversationId: id,
        createdAt: now,
        role: message.role,
        content: message.content,
        provider: message.provider ?? null,
        model: message.model ?? null,
      }))

      const updatedConversation: ConversationWithMessages = {
        ...existingConversation,
        updatedAt: now,
        messages: [...existingConversation.messages, ...newMessages],
      }

      store.set(id, updatedConversation)
      return cloneConversation(updatedConversation)
    }
  },
  
  /**
   * Delete a conversation and all its messages.
   */
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    try {
      // Use a transaction to delete messages and conversation
      await prisma.$transaction(async (tx: PrismaClient) => {
        // Verify ownership
        const conversation = await tx.conversation.findFirst({
          where: { id: id, userId: userId },
        })
        if (!conversation) {
          throw new Error('Conversation not found or unauthorized')
        }
        
        // 1. Delete messages
        await tx.message.deleteMany({
          where: { conversationId: id },
        })
        
        // 2. Delete conversation
        await tx.conversation.delete({
          where: { id: id },
        })
      })
      return true
    } catch (error) {
      logFallbackWarning('deleteConversation', error)
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
