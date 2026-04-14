import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { mergeAttributionFromCookieHeader } from '@/lib/acquisition-attribution'
import { ConversationService } from '@/services/conversation-service.db'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { z } from 'zod'

// Zod schema for adding messages
const addMessagesSchema = z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      cost: z.number().optional(),
      latency: z.number().optional(),
    })
  ).min(1)

type RouteContext = {
  params: Promise<{ id?: string | string[] }>
}

const resolveId = (value: string | string[] | undefined) => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? ''
  return ''
}

/**
 * GET /api/conversations/[id]
 * Retrieves a single, full conversation with all messages.
 */
export async function GET(
  _req: Request,
  { params }: RouteContext
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const id = resolveId((await params).id)
    const conversation = await ConversationService.getFullConversation(id, user.id)

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json(conversation)
  } catch (error) {
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
  { params }: RouteContext
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const id = resolveId((await params).id)
    const body = await req.json()
    const validation = addMessagesSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Map messages to match Prisma schema (strip out extra fields like cost/latency)
    const prismaMessages = validation.data.map(({ role, content, provider, model }) => ({
      role,
      content,
      provider: provider ?? null,
      model: model ?? null,
    }))

    const updatedConversation = await ConversationService.addMessages(id, user.id, prismaMessages)

    if (!updatedConversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const comparisonTaggedMessages = prismaMessages.filter(
      (message) => message.role === 'assistant' && Boolean(message.provider),
    )

    if (comparisonTaggedMessages.length > 0) {
      const providers = [
        ...new Set(
          comparisonTaggedMessages
            .map((message) => message.provider)
            .filter((provider): provider is string => typeof provider === 'string'),
        ),
      ]

      try {
        await recordAnalyticsEvent({
          event: 'comparison_ready_conversation_saved',
          userId: user.id,
          payload: mergeAttributionFromCookieHeader(
            {
              conversationId: id,
              responseCount: comparisonTaggedMessages.length,
              providers,
            },
            req.headers.get('cookie'),
          ),
        })
      } catch (analyticsError) {
        console.warn(
          'Failed to record analytics event for comparison-ready conversation save:',
          analyticsError,
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
  { params }: RouteContext
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const id = resolveId((await params).id)
    const body = await req.json()
    const updateSchema = z.object({ title: z.string().min(1).max(200) })
    const validation = updateSchema.safeParse(body)

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
  { params }: RouteContext
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const id = resolveId((await params).id)
    const success = await ConversationService.deleteConversation(id, user.id)

    if (!success) {
      return NextResponse.json({ error: 'Conversation not found or failed to delete' }, { status: 404 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json(
      { error: 'Failed to delete conversation' },
      { status: 500 }
    )
  }
}
