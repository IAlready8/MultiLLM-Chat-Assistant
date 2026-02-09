import { beforeEach, describe, expect, it, vi } from 'vitest'

const DB_UNAVAILABLE_ERROR = new Error(
  'Database access for goal is not available in this environment.'
)

type PrismaMock = {
  goal: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

const makePrismaMock = (): PrismaMock => ({
  goal: {
    findMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    findFirst: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    create: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    update: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    delete: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
  },
})

const loadService = async () => {
  const prismaMock = makePrismaMock()
  vi.doMock('@/lib/prisma', () => ({ prisma: prismaMock }))
  const mod = await import('@/services/goal-service.db')
  return { GoalService: mod.GoalService, prismaMock }
}

describe('GoalService DB fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __multiLlmGoalFallbackStore?: unknown })
      .__multiLlmGoalFallbackStore
  })

  it('creates, reads, updates, and deletes via in-memory fallback when DB is unavailable', async () => {
    const { GoalService } = await loadService()

    const created = await GoalService.createGoal(
      {
        title: 'Ship phase one',
        description: 'Complete API and UI hardening',
        status: 'pending',
      },
      'user-1'
    )

    expect(created.userId).toBe('user-1')
    expect(created.status).toBe('not-started')

    const list = await GoalService.getGoalsByUserId('user-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const updated = await GoalService.updateGoal(
      created.id,
      { status: 'done', title: 'Ship phase one complete' },
      'user-1'
    )
    expect(updated?.status).toBe('completed')
    expect(updated?.title).toBe('Ship phase one complete')

    const single = await GoalService.getGoalById(created.id, 'user-1')
    expect(single?.status).toBe('completed')

    const deleted = await GoalService.deleteGoal(created.id, 'user-1')
    expect(deleted).toBe(true)

    const afterDelete = await GoalService.getGoalsByUserId('user-1')
    expect(afterDelete).toHaveLength(0)
  })
})
