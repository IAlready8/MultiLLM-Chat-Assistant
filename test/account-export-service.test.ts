import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), count: vi.fn(), conversations: vi.fn(), messages: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: mocks.transaction } }))
import { exportAccountHistory } from '@/services/account-export-service'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.query.mockResolvedValue([{ messages: '1', bytes: '5' }])
  mocks.count.mockResolvedValue(1)
  mocks.conversations.mockResolvedValue([{ id: 'c', title: 'Owned' }])
  mocks.messages.mockResolvedValue([{ id: 'm', conversationId: 'c', content: 'Hello' }])
  mocks.transaction.mockImplementation(work => work({ $queryRaw: mocks.query, conversation: { count: mocks.count, findMany: mocks.conversations }, message: { findMany: mocks.messages } }))
})
it('takes one consistent snapshot with ownership on every query and explicit safe columns', async () => {
  const result = JSON.parse(await exportAccountHistory('owner'))
  expect(result.messages[0].content).toBe('Hello')
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead', timeout: 20000 })
  expect(mocks.query.mock.calls[0][1]).toBe('owner')
  expect(mocks.messages.mock.calls[0][0].where).toEqual({ conversation: { userId: 'owner' } })
  expect(mocks.conversations.mock.calls[0][0].select).not.toHaveProperty('user')
})
it.each([{ messages: '5001', bytes: '1' }, { messages: '1', bytes: '8388609' }])('rejects excessive exports before loading content', async stats => {
  mocks.query.mockResolvedValue([stats])
  await expect(exportAccountHistory('owner')).rejects.toMatchObject({ status: 413 })
  expect(mocks.messages).not.toHaveBeenCalled()
})
