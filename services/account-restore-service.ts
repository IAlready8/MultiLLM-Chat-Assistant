import { createHash } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { LlmRequestError } from '@/lib/llm-request'

export const ACCOUNT_RESTORE_MAX_BYTES = 3 * 1024 * 1024
const identifier = z.string().min(1).max(128)
const timestamp = z.iso.datetime().refine(value => Number.isFinite(Date.parse(value)))
const nullableIdentifier = identifier.nullable()
const archiveSchema = z.object({
  format: z.literal('multillm-conversation-archive'), version: z.literal(1), exportedAt: timestamp,
  conversations: z.array(z.object({
    id: identifier, title: z.string().min(1).max(255), createdAt: timestamp, updatedAt: timestamp,
  }).strict()).max(200),
  messages: z.array(z.object({
    id: identifier, conversationId: identifier, role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(128_000), provider: z.string().max(128).nullable(), model: z.string().max(256).nullable(),
    createdAt: timestamp, clientId: nullableIdentifier, turnId: nullableIdentifier,
    instanceId: nullableIdentifier, position: z.number().int().min(0).max(10000).nullable(),
    generationStatus: z.enum(['complete', 'running', 'failed', 'canceled', 'interrupted']),
  }).strict()).max(2000),
}).strict()
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const uuid = (value: string) => {
  const hash = digest(value)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export async function restoreAccountHistory(userId: string, value: unknown) {
  const parsed = archiveSchema.safeParse(value)
  if (!parsed.success) throw new LlmRequestError('Invalid archive. Restore supports version 1, up to 200 conversations and 2,000 messages.', 400, 'INVALID_ARCHIVE')
  const { conversations, messages } = parsed.data
  const conversationIds = new Set(conversations.map(item => item.id))
  const messageIds = new Set(messages.map(item => item.id))
  const clientIds = new Set<string>()
  if (conversationIds.size !== conversations.length || messageIds.size !== messages.length) throw new LlmRequestError('Archive contains duplicate IDs.', 400, 'INVALID_ARCHIVE')
  for (const message of messages) {
    if (!conversationIds.has(message.conversationId)) throw new LlmRequestError('Archive contains an orphan message.', 400, 'INVALID_ARCHIVE')
    if (message.clientId) {
      const key = JSON.stringify([message.conversationId, message.clientId])
      if (clientIds.has(key)) throw new LlmRequestError('Archive contains duplicate message identities.', 400, 'INVALID_ARCHIVE')
      clientIds.add(key)
    }
  }
  // Export timestamps do not change archive identity. Imported records never overwrite originals.
  const archiveId = digest(JSON.stringify({ conversations, messages }))
  const targetId = (id: string) => `archive_${digest(JSON.stringify([userId, archiveId, id]))}`
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`account-restore:${userId}`}, 0))`
    const existing = await tx.conversation.findMany({ where: { userId, id: { in: conversations.map(item => targetId(item.id)) } }, select: { id: true } })
    const restored = new Set(existing.map(item => item.id))
    let createdMessages = 0
    for (const conversation of conversations) {
      const id = targetId(conversation.id)
      if (restored.has(id)) continue
      const conversationMessages = messages.filter(message => message.conversationId === conversation.id)
      await tx.conversation.create({ data: {
        id, userId, title: conversation.title, createdAt: new Date(conversation.createdAt), updatedAt: new Date(conversation.updatedAt),
        messages: { create: conversationMessages.map((message, index) => ({
          id: `archive_${digest(id).slice(0, 32)}_${String(index).padStart(4, '0')}`, role: message.role, content: message.content,
          provider: message.provider, model: message.model, createdAt: new Date(message.createdAt),
          clientId: message.clientId ? uuid(`${id}:${message.clientId}`) : null,
          turnId: message.turnId ? uuid(`${id}:${message.turnId}`) : null,
          instanceId: message.instanceId, position: message.position,
          generationStatus: message.generationStatus === 'running' ? 'interrupted' : message.generationStatus,
        })) },
      } })
      createdMessages += conversationMessages.length
    }
    return { createdConversations: conversations.length - restored.size, createdMessages, skippedConversations: restored.size }
  }, { timeout: 20_000 })
}
