import { prisma } from '@/lib/prisma';
import { errorManager, createErrorContext, DatabaseError } from '@/lib/error-system';
import type { User, Conversation, Message } from '@/types/prisma';

type MessageInput = Omit<Message, 'id' | 'conversationId' | 'createdAt'>;

/**
 * Server-side service for managing conversations and messages in the main database.
 */
export class ConversationService {
    private static instance: ConversationService;

    private constructor() {}

    public static getInstance(): ConversationService {
        if (!ConversationService.instance) {
            ConversationService.instance = new ConversationService();
        }
        return ConversationService.instance;
    }

    /**
     * Creates a new conversation with its initial messages.
     * @param userId The ID of the user creating the conversation.
     * @param title The title of the conversation.
     * @param messages An array of initial messages to create.
     * @returns The newly created conversation with its messages.
     */
    async createConversation(userId: User['id'], title: string, messages: MessageInput[]): Promise<Conversation & { messages: Message[] }> {
        const context = createErrorContext('/services/conversation-service/create', userId);
        try {
            const conversation = await prisma.conversation.create({
                data: {
                    userId,
                    title,
                    messages: {
                        create: messages,
                    },
                },
                include: {
                    messages: true,
                },
            });
            return conversation as Conversation & { messages: Message[] };
        } catch (error) {
            const dbError = new DatabaseError('Failed to create conversation', context, error as Error);
            await errorManager.logError(dbError, context);
            throw dbError;
        }
    }

    /**
     * Retrieves all conversations for a given user, without messages.
     * @param userId The ID of the user.
     * @returns An array of conversations.
     */
    async getConversations(userId: User['id']): Promise<Conversation[]> {
        const context = createErrorContext('/services/conversation-service/getAll', userId);
        try {
            return await prisma.conversation.findMany({
                where: { userId },
                orderBy: { updatedAt: 'desc' },
            });
        } catch (error) {
            const dbError = new DatabaseError('Failed to retrieve conversations', context, error as Error);
            await errorManager.logError(dbError, context);
            throw dbError;
        }
    }

    /**
     * Retrieves a single conversation with its messages.
     * @param conversationId The ID of the conversation.
     * @returns The conversation object or null if not found.
     */
    async getConversation(conversationId: Conversation['id']): Promise<(Conversation & { messages: Message[] }) | null> {
        const context = createErrorContext('/services/conversation-service/get', undefined, { conversationId });
        try {
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
            return conversation as (Conversation & { messages: Message[] }) | null;
        } catch (error) {
            const dbError = new DatabaseError('Failed to retrieve conversation', context, error as Error);
            await errorManager.logError(dbError, context);
            throw dbError;
        }
    }

    /**
     * Adds a new message to an existing conversation.
     * @param conversationId The ID of the conversation to add the message to.
     * @param message The message data to create.
     * @returns The newly created message.
     */
    async addMessage(conversationId: Conversation['id'], message: MessageInput): Promise<Message> {
        const context = createErrorContext('/services/conversation-service/addMessage', undefined, { conversationId });
        try {
            // Also update the conversation's updatedAt timestamp
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            });

            return await prisma.message.create({
                data: {
                    conversationId,
                    ...message,
                },
            });
        } catch (error) {
            const dbError = new DatabaseError('Failed to add message', context, error as Error);
            await errorManager.logError(dbError, context);
            throw dbError;
        }
    }
}

export const conversationService = ConversationService.getInstance();
