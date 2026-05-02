import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  mergeAttributionFromCookieHeader,
} from '@/lib/acquisition-attribution'
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
      promptTokens: z.number().int().nonnegative().nullable().optional(),
      completionTokens: z.number().int().nonnegative().nullable().optional(),
      totalTokens: z.number().int().nonnegative().nullable().optional(),
      costUsd: z.number().nonnegative().nullable().optional(),
      latencyMs: z.number().int().nonnegative().nullable().optional(),
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

  // Map messages to match Prisma schema while dropping legacy cost/latency aliases.
  const prismaMessages = messages.map(({
    role,
    content,
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    latencyMs,
  }) => ({
    role,
    content,
    provider: provider ?? null,
    model: model ?? null,
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(latencyMs !== undefined ? { latencyMs } : {}),
  }))

  try {
    const newConversation = await ConversationService.createConversation(
      user.id,
      title,
      prismaMessages
    )
    try {
      await recordAnalyticsEvent({
        event: 'conversation_created',
        userId: user.id,
        payload: mergeAttributionFromCookieHeader(
          {
            messageCount: prismaMessages.length,
            hasProviderTaggedMessage: prismaMessages.some(message =>
              Boolean(message.provider)
            ),
          },
          req.headers.get('cookie')
        ),
      })
    } catch (analyticsError) {
      console.warn(
        'Failed to record analytics event for conversation creation:',
        analyticsError
      )
    }
    return NextResponse.json(newConversation, { status: 201 })
  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
})
