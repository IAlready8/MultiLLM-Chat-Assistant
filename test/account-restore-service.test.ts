import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), find: vi.fn(), create: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: mocks.transaction } }))
import { restoreAccountHistory } from '@/services/account-restore-service'
const archive = () => ({
  format: 'multillm-conversation-archive', version: 1, exportedAt: '2026-09-08T00:00:00.000Z',
  conversations: [{ id: 'source-conversation', title: 'Saved', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
  messages: [{ id: 'source-message', conversationId: 'source-conversation', role: 'assistant', content: 'Partial answer', provider: 'openai', model: 'example', createdAt: '2026-09-01T00:00:00.000Z', clientId: null, turnId: 'old-turn', instanceId: 'instance', position: 0, generationStatus: 'running' }],
})
beforeEach(() => {
  vi.resetAllMocks(); mocks.find.mockResolvedValue([]); mocks.create.mockResolvedValue({})
  mocks.transaction.mockImplementation(work => work({ $queryRaw: mocks.query, conversation: { findMany: mocks.find, create: mocks.create } }))
})
it('creates account-owned copies with fresh identities and interrupts unfinished responses', async () => {
  expect(await restoreAccountHistory('owner', archive())).toEqual({ createdConversations: 1, createdMessages: 1, skippedConversations: 0 })
  const data = mocks.create.mock.calls[0][0].data
  expect(data.userId).toBe('owner'); expect(data.id).not.toBe('source-conversation')
  expect(data.messages.create[0]).toMatchObject({ content: 'Partial answer', generationStatus: 'interrupted' })
  expect(data.messages.create[0].turnId).toMatch(/^[0-9a-f-]{36}$/)
  expect(data).not.toHaveProperty('generations'); expect(data).not.toHaveProperty('llmQuotaUsage')
})
it('skips a repeated import without overwriting edited copies', async () => {
  await restoreAccountHistory('owner', archive())
  const id = mocks.create.mock.calls[0][0].data.id
  mocks.find.mockResolvedValue([{ id }]); mocks.create.mockClear()
  expect(await restoreAccountHistory('owner', { ...archive(), exportedAt: '2026-09-09T00:00:00.000Z' })).toEqual({ createdConversations: 0, createdMessages: 0, skippedConversations: 1 })
  expect(mocks.create).not.toHaveBeenCalled()
})
it('uses different identities for different accounts', async () => {
  await restoreAccountHistory('owner', archive()); await restoreAccountHistory('other', archive())
  expect(mocks.create.mock.calls[0][0].data.id).not.toBe(mocks.create.mock.calls[1][0].data.id)
})
it.each(['orphan', 'duplicate', 'ownership', 'billing', 'status'])('rejects invalid %s input before a transaction', async kind => {
  const value = archive()
  if (kind === 'orphan') value.messages[0].conversationId = 'missing'
  if (kind === 'duplicate') value.messages.push(value.messages[0])
  if (kind === 'ownership') Object.assign(value.conversations[0], { userId: 'victim' })
  if (kind === 'billing') Object.assign(value, { subscription: { tier: 'PRO' } })
  if (kind === 'status') value.messages[0].generationStatus = 'invented'
  await expect(restoreAccountHistory('owner', value)).rejects.toMatchObject({ status: 400 })
  expect(mocks.transaction).not.toHaveBeenCalled()
})
