import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  mergeAttributionFromCookieHeader,
} from '@/lib/acquisition-attribution'
import { ConversationService } from '@/services/conversation-service.db'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'
import {
  apiReadCacheKey,
  cachedJsonResponse,
  invalidateApiReadCache,
} from '@/lib/api-read-cache'
import { z } from 'zod'
import { readBoundedJson, LlmRequestError } from '@/lib/llm-request'

// Zod schema for creating a conversation
const createConvoSchema = z.object({
  title: z.string().min(1).max(200).max(255),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(200).max(128_000),
      clientId: z.string().uuid().nullable().optional(),
      instanceId: z.string().max(128).nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      cost: z.number().optional(),
      latency: z.number().optional(),
    })
  ).min(1).max(200),
})

/**
 * GET /api/conversations
 * Retrieves all conversations (metadata) for the authenticated user.
 */
export const GET = withApiMetrics(async (_req: Request) => {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    return await cachedJsonResponse(
      '/api/conversations',
      apiReadCacheKey('/api/conversations', user.id),
      () => ConversationService.getConversationsByUserId(user.id)
    )
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
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  let body: unknown
    try { body = await readBoundedJson(req) } catch (error) {
      if (error instanceof LlmRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
      throw error
    }
  const validation = createConvoSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  const { title, messages } = validation.data

  // Map messages to match Prisma schema (strip out extra fields like cost/latency)
  const prismaMessages = messages.map(({ role, content, provider, model, clientId, instanceId }) => ({
    role,
    content,
    provider: provider ?? null,
    model: model ?? null,
    ...(clientId ? { clientId } : {}),
    ...(instanceId ? { instanceId } : {}),
  }))

  try {
    const newConversation = await ConversationService.createConversation(
      user.id,
      title,
      prismaMessages
    )
    invalidateApiReadCache(apiReadCacheKey('/api/conversations', user.id))
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
