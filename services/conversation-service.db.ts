import { prisma } from '@/lib/prisma'
import { Conversation, Message } from '@prisma/client'

/**
 * This service provides all database operations for Conversations,
 * replacing the old client-side IndexedDB logic.
 */
export const ConversationService = {
  /**
   * Get all conversations (metadata only) for a user.
   */
  async getConversationsByUserId(userId: string): Promise<Conversation[]> {
    return prisma.conversation.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })
  },

  /**
   * Get a single, full conversation with all messages.
   */
  async getFullConversation(
    id: string,
    userId: string
  ): Promise<(Conversation & { messages: Message[] }) | null> {
    return prisma.conversation.findFirst({
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
  },

  /**
   * Create a new conversation with its first messages.
   */
  async createConversation(
    userId: string,
    title: string,
    messagesData: Omit<Message, 'id' | 'conversationId' | 'createdAt'>[]
  ): Promise<Conversation> {
    return prisma.conversation.create({
      data: {
        userId: userId,
        title: title,
        messages: {
          create: messagesData,
        },
      },
    })
  },

  /**
   * Add messages to an existing conversation.
   */
  async addMessages(
    id: string,
    userId: string,
    messagesData: Omit<Message, 'id' | 'conversationId' | 'createdAt'>[]
  ): Promise<Conversation | null> {
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
    
    return this.getFullConversation(id, userId);
  },
  
  /**
   * Delete a conversation and all its messages.
   */
  async deleteConversation(id: string, userId: string): Promise<boolean> {
    // Use a transaction to delete messages and conversation
    try {
      await prisma.$transaction(async (tx) => {
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
      console.error('Failed to delete conversation:', error)
      return false
    }
  },
}