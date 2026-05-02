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
      cost: z.number().optional(),
      latency: z.number().optional(),
    })
  ).min(1),
})

type ConversationsCacheEntry = {
  value: Awaited<ReturnType<typeof ConversationService.getConversationsByUserId>>
  expiresAt: number
}

const conversationsInFlight = new Map<string, Promise<ConversationsCacheEntry>>()
const conversationsReadCache = new Map<string, ConversationsCacheEntry>()

const readCacheEnabled = () => process.env.ENABLE_API_READ_CACHE === 'true'
const readCacheTtlMs = () => Number(process.env.API_READ_CACHE_TTL_MS ?? '30000')

const cacheKeyForUser = (userId: string) => `conversations:${userId}`

const getCachedConversations = (key: string) => {
  const cached = conversationsReadCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    conversationsReadCache.delete(key)
    return null
  }
  return cached.value
}

/**
 * GET /api/conversations
 * Retrieves all conversations (metadata) for the authenticated user.
 */
export const GET = withApiMetrics(async (_req: Request) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const key = cacheKeyForUser(user.id)
    if (readCacheEnabled()) {
      const cached = getCachedConversations(key)
      if (cached) {
        return NextResponse.json(cached)
      }

      const inFlight = conversationsInFlight.get(key)
      if (inFlight) {
        const entry = await inFlight
        return NextResponse.json(entry.value)
      }
    }

    const fetchPromise = ConversationService.getConversationsByUserId(
      user.id
    ).then(value => ({
      value,
      expiresAt: Date.now() + readCacheTtlMs(),
    }))

    if (readCacheEnabled()) {
      conversationsInFlight.set(key, fetchPromise)
    }

    const entry = await fetchPromise
    if (readCacheEnabled()) {
      conversationsReadCache.set(key, entry)
      conversationsInFlight.delete(key)
    }
    const conversations = entry.value
    return NextResponse.json(conversations)
  } catch (error) {
    conversationsInFlight.delete(cacheKeyForUser(user.id))
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
    conversationsReadCache.delete(cacheKeyForUser(user.id))
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
