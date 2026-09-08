import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { LlmRequestError, type LlmInput } from '@/lib/llm-request'
import { apiReadCacheKey, invalidateApiReadCache } from '@/lib/api-read-cache'
import type { Message } from '@/types/prisma'

export type SavedGenerationInput = LlmInput & {
  conversationId: string
  requestId: string
  turnId: string
  instanceId?: string
  position?: number
}

export async function beginGeneration(userId: string, input: SavedGenerationInput) {
  const id = createHash('sha256').update(`${userId}:${input.requestId}`).digest('hex')
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const readExisting = async () => {
    const existing = await prisma.generation.findUnique({ where: { id }, include: { message: true } })
    if (!existing) return null
    if (existing.requestHash !== requestHash) throw new LlmRequestError('This request ID was already used for a different generation', 409, 'REQUEST_ID_CONFLICT')
    if (existing.status !== 'complete') throw new LlmRequestError('This generation has already started. Reload the conversation or regenerate with a new request.', 409, 'GENERATION_ALREADY_STARTED')
    return { id, replay: existing.message?.content ?? '' }
  }
  const existing = await readExisting()
  if (existing) return existing
  try {
    await prisma.$transaction(async tx => {
      const conversation = await tx.conversation.findFirst({ where: { id: input.conversationId, userId } })
      if (!conversation) throw new LlmRequestError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
      const turn = await tx.message.findFirst({ where: { conversationId: input.conversationId, clientId: input.turnId, role: 'user' } })
      if (!turn) throw new LlmRequestError('Save the user message before starting a generation', 409, 'TURN_NOT_FOUND')
      await tx.message.create({ data: { id, conversationId: input.conversationId, role: 'assistant', content: '', provider: input.provider, model: input.model, instanceId: input.instanceId, turnId: input.turnId, position: input.position ?? 0, generationStatus: 'running' } })
      await tx.generation.create({ data: { id, requestHash, userId, conversationId: input.conversationId, messageId: id, status: 'running' } })
      await tx.conversation.update({ where: { id: input.conversationId, userId }, data: { updatedAt: new Date() } })
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const concurrent = await readExisting()
      if (concurrent) return concurrent
    }
    throw error
  }
  invalidateApiReadCache(apiReadCacheKey('/api/conversations', userId))
  return { id, replay: null }
}

export async function finishGeneration(userId: string, id: string, content: string, status: 'complete' | 'failed' | 'canceled', usage?: { prompt_tokens: number; completion_tokens: number; usage_source: string }) {
  await prisma.$transaction(async tx => {
    const generation = await tx.generation.findFirst({ where: { id, userId } })
    if (!generation) throw new LlmRequestError('The saved generation no longer exists', 404, 'GENERATION_NOT_FOUND')
    if (generation.status !== 'running') return
    const updated = await tx.generation.updateMany({ where: { id, userId, status: 'running' }, data: { status, promptTokens: usage?.prompt_tokens ?? 0, completionTokens: usage?.completion_tokens ?? 0, usageSource: usage?.usage_source ?? 'unknown' } })
    if (updated.count !== 1) return
    await tx.message.update({ where: { id: generation.messageId }, data: { content, generationStatus: status } })
  })
  invalidateApiReadCache(apiReadCacheKey('/api/conversations', userId))
}

export function orderConversationMessages(messages: Message[]): Message[] {
  const byTurn = new Map<string, Message[]>()
  const turns = new Set(messages.filter(message => message.role === 'user').map(message => message.clientId))
  for (const message of messages) {
    if (message.turnId && turns.has(message.turnId)) {
      byTurn.set(message.turnId, [...(byTurn.get(message.turnId) ?? []), message])
    }
  }
  return messages.flatMap(message => {
    if (message.turnId && turns.has(message.turnId)) return []
    const responses = message.clientId ? byTurn.get(message.clientId) ?? [] : []
    responses.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))
    return [message, ...responses]
  })
}
