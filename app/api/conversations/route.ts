import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { ConversationService } from '@/services/conversation-service.db'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'
import { z } from 'zod'

// Zod schema for creating a conversation
const createConvoSchema = z.object({
  title: z.string().min(1).max(255),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      cost: z.number().optional(),
      latency: z.number().optional(),
    })
  ).min(1),
})

/**
 * GET /api/conversations
 * Retrieves all conversations (metadata) for the authenticated user.
 */
export const GET = withApiMetrics(async (_req: Request) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const conversations = await ConversationService.getConversationsByUserId(user.id)
    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Error loading conversations:', error)
    return NextResponse.json(
      { error: 'Failed to load conversations' },
      { status: 500 }
    )
  }
})

/**
 * POST /api/conversations
 * Creates a new conversation and its first messages.
 */
export const POST = withApiMetrics(async (req: Request) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await req.json()
  const validation = createConvoSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  const { title, messages } = validation.data

  // Map messages to match Prisma schema (strip out extra fields like cost/latency)
  const prismaMessages = messages.map(({ role, content, provider, model }) => ({
    role,
    content,
    provider: provider ?? null,
    model: model ?? null,
  }))

  try {
    const newConversation = await ConversationService.createConversation(
      user.id,
      title,
      prismaMessages
    )
    await recordAnalyticsEvent({
      event: 'conversation_created',
      userId: user.id,
      payload: {
        messageCount: prismaMessages.length,
        hasProviderTaggedMessage: prismaMessages.some(message => Boolean(message.provider)),
      },
    })
    return NextResponse.json(newConversation, { status: 201 })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
})
