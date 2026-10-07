import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ expired: vi.fn(), find: vi.fn(), findRunning: vi.fn(), create: vi.fn(), update: vi.fn(), messageCreate: vi.fn(), messageUpdate: vi.fn(), conversation: vi.fn(), turn: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const tx = {
    generation: { findMany: mocks.expired, findUnique: mocks.find, findFirst: mocks.findRunning, create: mocks.create, updateMany: mocks.update },
    conversation: { findFirst: mocks.conversation, update: vi.fn() },
    message: { create: mocks.messageCreate, update: mocks.messageUpdate, findFirst: mocks.turn },
  }
  return { prisma: { ...tx, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }
})
import { beginGeneration, checkpointGeneration, reconcileExpiredGenerations, finishGeneration, type SavedGenerationInput } from '@/services/generation-service'

describe('durable generation lifecycle', () => {
  const input: SavedGenerationInput = { conversationId: 'conversation', requestId: '00000000-0000-4000-8000-000000000001', turnId: '00000000-0000-4000-8000-000000000002', provider: 'openai', model: 'model', messages: [{ role: 'user', content: 'prompt' }] }
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.find.mockResolvedValue(null)
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.conversation.mockResolvedValue({ id: 'conversation', userId: 'user' })
    mocks.turn.mockResolvedValue({ id: 'user-message' })
  })
  it('reserves a correctly attributed response and request before dispatch', async () => {
    const generation = await beginGeneration('user', input)
    expect(generation.replay).toBeNull()
    expect(mocks.messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ id: generation.id, provider: 'openai', model: 'model', turnId: input.turnId, generationStatus: 'running' }) })
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user', requestHash: expect.any(String), messageId: generation.id }) })
  })
  it('rejects another user’s conversation before creating anything', async () => {
    mocks.conversation.mockResolvedValue(null)
    await expect(beginGeneration('intruder', input)).rejects.toMatchObject({ status: 404 })
    expect(mocks.conversation).toHaveBeenCalledWith({ where: { id: 'conversation', userId: 'intruder' } })
    expect(mocks.messageCreate).not.toHaveBeenCalled()
  })
  it('requires a persisted user turn', async () => {
    mocks.turn.mockResolvedValue(null)
    await expect(beginGeneration('user', input)).rejects.toMatchObject({ code: 'TURN_NOT_FOUND' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('replays a completed request without another write', async () => {
    const first = await beginGeneration('user', input)
    const saved = mocks.create.mock.calls[0][0].data
    mocks.find.mockResolvedValue({ ...saved, status: 'complete', message: { content: 'saved answer' } })
    await expect(beginGeneration('user', input)).resolves.toEqual({ id: first.id, replay: 'saved answer' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('rejects duplicate in-flight requests and conflicting request reuse', async () => {
    await beginGeneration('user', input)
    const saved = mocks.create.mock.calls[0][0].data
    mocks.find.mockResolvedValue(saved)
    await expect(beginGeneration('user', input)).rejects.toMatchObject({ code: 'GENERATION_ALREADY_STARTED' })
    await expect(beginGeneration('user', { ...input, model: 'different' })).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('atomically stores partial cancellation and labels token estimates', async () => {
    mocks.findRunning.mockResolvedValue({ messageId: 'message', status: 'running' })
    await finishGeneration('user', 'generation', 'partial', 'canceled', { prompt_tokens: 4, completion_tokens: 2, usage_source: 'estimated' })
    expect(mocks.messageUpdate).toHaveBeenCalledWith({ where: { id: 'message' }, data: { content: 'partial', generationStatus: 'canceled' } })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'generation', userId: 'user', status: 'running' }, data: { status: 'canceled', promptTokens: 4, completionTokens: 2, usageSource: 'estimated' } })
  })
  it('does not overwrite an already completed generation', async () => {
    mocks.findRunning.mockResolvedValue({ status: 'complete' })
    await finishGeneration('user', 'generation', 'late partial', 'failed')
    expect(mocks.messageUpdate).not.toHaveBeenCalled()
  })
})


describe('generation checkpoint fencing and recovery', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.update.mockResolvedValue({ count: 1 }) })
  it('saves partial progress and usage only while the lease is active', async () => {
    await checkpointGeneration('user', 'generation', 'partial answer', { prompt_tokens: 12, completion_tokens: 4, usage_source: 'estimated' })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'generation', userId: 'user', status: 'running', leaseExpiresAt: { gt: expect.any(Date) } } }))
    expect(mocks.messageUpdate).toHaveBeenCalledWith({ where: { id: 'generation' }, data: { content: 'partial answer' } })
  })
  it('does not overwrite progress when its lease has been lost', async () => {
    mocks.update.mockResolvedValue({ count: 0 })
    await expect(checkpointGeneration('user', 'generation', 'late', { prompt_tokens: 1, completion_tokens: 1, usage_source: 'estimated' })).rejects.toMatchObject({ code: 'GENERATION_LEASE_LOST' })
    expect(mocks.messageUpdate).not.toHaveBeenCalled()
  })
  it('marks expired work interrupted while retaining checkpointed content and usage', async () => {
    mocks.expired.mockResolvedValue([{ id: 'generation', messageId: 'message', userId: 'user' }])
    await expect(reconcileExpiredGenerations('user', 'conversation')).resolves.toEqual({ recovered: 1, batchFull: false })
    expect(mocks.expired).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user', conversationId: 'conversation', status: 'running', leaseExpiresAt: { lte: expect.any(Date) } }, take: 100 }))
    expect(mocks.messageUpdate).toHaveBeenCalledWith({ where: { id: 'message' }, data: { generationStatus: 'interrupted' } })
  })
  it('cannot interrupt a generation that completed or renewed after the scan', async () => {
    mocks.expired.mockResolvedValue([{ id: 'generation', messageId: 'message', userId: 'user' }])
    mocks.update.mockResolvedValue({ count: 0 })
    await expect(reconcileExpiredGenerations()).resolves.toEqual({ recovered: 0, batchFull: false })
    expect(mocks.messageUpdate).not.toHaveBeenCalled()
  })
  it('rejects a late finalizer after reconciliation won the race', async () => {
    mocks.findRunning.mockResolvedValue({ status: 'running', messageId: 'message' })
    mocks.update.mockResolvedValue({ count: 0 })
    await expect(finishGeneration('user', 'generation', 'late', 'complete')).rejects.toMatchObject({ code: 'GENERATION_LEASE_LOST' })
    expect(mocks.messageUpdate).not.toHaveBeenCalled()
  })
})
