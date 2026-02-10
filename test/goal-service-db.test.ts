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

const loadServiceWithPrismaMock = async (prismaMock: PrismaMock) => {
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

  it('uses fallback records when DB is reachable but user-scoped rows are missing', async () => {
    const fkConstraintError = new Error(
      'Foreign key constraint failed on the field: Goal_userId_fkey'
    )

    const prismaMock: PrismaMock = {
      goal: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(fkConstraintError),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }

    const { GoalService } = await loadServiceWithPrismaMock(prismaMock)

    const created = await GoalService.createGoal(
      {
        title: 'Guest fallback goal',
        description: 'Stored in memory when FK prevents DB write',
        status: 'pending',
      },
      'guest-local-user'
    )

    const list = await GoalService.getGoalsByUserId('guest-local-user')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const updated = await GoalService.updateGoal(
      created.id,
      { status: 'done' },
      'guest-local-user'
    )
    expect(updated?.status).toBe('completed')

    const deleted = await GoalService.deleteGoal(created.id, 'guest-local-user')
    expect(deleted).toBe(true)
  })

  it('throws unexpected write errors instead of silently falling back', async () => {
    const unexpectedError = new Error('Unique constraint failed on Goal.title')

    const prismaMock: PrismaMock = {
      goal: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(unexpectedError),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }

    const { GoalService } = await loadServiceWithPrismaMock(prismaMock)

    await expect(
      GoalService.createGoal(
        {
          title: 'Should fail',
          description: 'Unexpected DB errors should not be swallowed.',
          status: 'pending',
        },
        'user-1'
      )
    ).rejects.toThrow('Unique constraint failed on Goal.title')
  })
})
