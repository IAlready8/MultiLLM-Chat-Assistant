import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  mergeAttributionFromCookieHeader,
} from '@/lib/acquisition-attribution'
import { ConversationService } from '@/services/conversation-service.db'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import {
  apiReadCacheKey,
  invalidateApiReadCache,
} from '@/lib/api-read-cache'
import { z } from 'zod'
import { readBoundedJson, LlmRequestError } from '@/lib/llm-request'
import { getConversationMessagePage, parseMessagePage } from '@/services/conversation-context'

// Zod schema for adding messages
const addMessagesSchema = z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(128_000),
      clientId: z.string().uuid().nullable().optional(),
      instanceId: z.string().max(128).nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      cost: z.number().optional(),
      latency: z.number().optional(),
    })
  ).min(1).max(200)

const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(255),
})

type ConversationRouteContext = {
  params: Promise<{ id: string }>
}

/**
 * GET /api/conversations/[id]
 * Without paging parameters, retrieves the full conversation (legacy workspaces).
 * With ?messagesLimit=N[&before=cursor], returns the newest N complete user
 * turns and a cursor for older turns.
 */
export async function GET(
  req: Request,
  context: ConversationRouteContext
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { params } = context
    const { id } = await params
    let page: ReturnType<typeof parseMessagePage>
    try { page = parseMessagePage(new URL(req.url).searchParams) } catch (error) {
      if (error instanceof LlmRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
      throw error
    }
    if (page) {
      const paged = await getConversationMessagePage(id, user.id, page)
      if (!paged) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      return NextResponse.json(paged, { headers: { 'Cache-Control': 'no-store' } })
    }
    const conversation = await ConversationService.getFullConversation(id, user.id)

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json(conversation)
  } catch (error) {
    if (error instanceof LlmRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    console.error('Error loading conversation:', error)
    return NextResponse.json(
      { error: 'Failed to load conversation' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/conversations/[id]
 * Adds new messages to an existing conversation.
 */
export async function POST(
  req: Request,
  context: ConversationRouteContext
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { params } = context
    const { id } = await params
    let body: unknown
    try { body = await readBoundedJson(req) } catch (error) {
      if (error instanceof LlmRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
      throw error
    }
    const validation = addMessagesSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Map messages to match Prisma schema (strip out extra fields like cost/latency)
    const prismaMessages = validation.data.map(({ role, content, provider, model, clientId, instanceId }) => ({
      role,
      content,
      provider: provider ?? null,
      model: model ?? null,
    ...(clientId ? { clientId } : {}),
    ...(instanceId ? { instanceId } : {}),
    }))

    const updatedConversation = await ConversationService.addMessages(id, user.id, prismaMessages)

    if (!updatedConversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    invalidateApiReadCache(apiReadCacheKey('/api/conversations', user.id))

    const comparisonReadyMessages = prismaMessages.filter(
      message => message.role === 'assistant' && Boolean(message.provider)
    )

    if (comparisonReadyMessages.length > 0) {
      try {
        await recordAnalyticsEvent({
          event: 'comparison_ready_conversation_saved',
          userId: user.id,
          payload: mergeAttributionFromCookieHeader(
            {
              conversationId: id,
              responseCount: comparisonReadyMessages.length,
              providers: Array.from(
                new Set(
                  comparisonReadyMessages
                    .map(message => message.provider)
                    .filter((provider): provider is string => Boolean(provider))
                )
              ),
            },
            req.headers.get('cookie')
          ),
        })
      } catch (analyticsError) {
        console.warn(
          'Failed to record analytics event for comparison-ready conversation save:',
          analyticsError
        )
      }
    }

    return NextResponse.json(updatedConversation)
  } catch (error) {
    console.error('Error updating conversation:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/conversations/[id]
 * Updates conversation metadata (currently title).
 */
export async function PUT(
  req: Request,
  context: ConversationRouteContext
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { params } = context
    const { id } = await params
    let body: unknown
    try { body = await readBoundedJson(req) } catch (error) {
      if (error instanceof LlmRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
      throw error
    }
    const validation = updateConversationSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const updatedConversation = await ConversationService.updateConversationTitle(
      id,
      user.id,
      validation.data.title
    )

    if (!updatedConversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    invalidateApiReadCache(apiReadCacheKey('/api/conversations', user.id))

    return NextResponse.json(updatedConversation)
  } catch (error) {
    console.error('Error renaming conversation:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/conversations/[id]
 * Deletes a conversation and all its messages.
 */
export async function DELETE(
  _req: Request,
  context: ConversationRouteContext
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { params } = context
    const { id } = await params
    const success = await ConversationService.deleteConversation(id, user.id)

    if (!success) {
      return NextResponse.json({ error: 'Conversation not found or failed to delete' }, { status: 404 })
    }

    invalidateApiReadCache(apiReadCacheKey('/api/conversations', user.id))

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    )
  }
}
