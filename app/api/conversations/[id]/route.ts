import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { ConversationService } from '@/services/conversation-service.db'
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

/**
 * GET /api/conversations/[id]
 * Retrieves a single, full conversation with all messages.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const { id } = params
  const conversation = await ConversationService.getFullConversation(id, user.id)

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  return NextResponse.json(conversation)
}

/**
 * POST /api/conversations/[id]
 * Adds new messages to an existing conversation.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const { id } = params
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

  return NextResponse.json(updatedConversation)
}

/**
 * DELETE /api/conversations/[id]
 * Deletes a conversation and all its messages.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const { id } = params
  const success = await ConversationService.deleteConversation(id, user.id)

  if (!success) {
    return NextResponse.json({ error: 'Conversation not found or failed to delete' }, { status: 404 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
