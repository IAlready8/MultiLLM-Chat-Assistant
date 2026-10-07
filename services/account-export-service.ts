import prisma from '@/lib/prisma'
import { LlmRequestError } from '@/lib/llm-request'

export const ACCOUNT_EXPORT_MAX_BYTES = 16 * 1024 * 1024

export async function exportAccountHistory(userId: string) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw`
      SELECT COUNT(*)::text AS messages,
        COALESCE(SUM(octet_length(m.content)), 0)::text AS bytes
      FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE c."userId" = ${userId}
    ` as Array<{ messages: string; bytes: string }>
    const conversationsCount = await tx.conversation.count({ where: { userId } })
    if (conversationsCount > 500 || Number(rows[0]?.messages ?? 0) > 5000 || Number(rows[0]?.bytes ?? 0) > 8 * 1024 * 1024) {
      throw new LlmRequestError('This account exceeds the archive limit (500 conversations, 5,000 messages or 8 MiB of text). No partial archive was created.', 413, 'EXPORT_TOO_LARGE')
    }
    const conversations = await tx.conversation.findMany({
      where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    })
    const messages = await tx.message.findMany({
      where: { conversation: { userId } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, conversationId: true, role: true, content: true,
        provider: true, model: true, createdAt: true, clientId: true,
        turnId: true, position: true, instanceId: true, generationStatus: true },
    })
    const archive = JSON.stringify({
      format: 'multillm-conversation-archive', version: 1,
      exportedAt: new Date().toISOString(), conversations, messages,
    })
    if (Buffer.byteLength(archive, 'utf8') > ACCOUNT_EXPORT_MAX_BYTES) {
      throw new LlmRequestError('The archive is too large. No partial archive was created.', 413, 'EXPORT_TOO_LARGE')
    }
    return archive
  }, { isolationLevel: 'RepeatableRead', timeout: 20_000 })
}
