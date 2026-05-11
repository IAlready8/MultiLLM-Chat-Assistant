import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGoalService = {
  getGoalsByUserId: vi.fn(),
  createGoal: vi.fn(),
  getGoalById: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
}

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/services/goal-service.db', () => ({
  GoalService: {
    getGoalsByUserId: (...args: unknown[]) =>
      mockGoalService.getGoalsByUserId(...args),
    createGoal: (...args: unknown[]) => mockGoalService.createGoal(...args),
    getGoalById: (...args: unknown[]) => mockGoalService.getGoalById(...args),
    updateGoal: (...args: unknown[]) => mockGoalService.updateGoal(...args),
    deleteGoal: (...args: unknown[]) => mockGoalService.deleteGoal(...args),
  },
}))

vi.mock('@/lib/api-metrics-wrapper', () => ({
  withApiMetrics: (
    handler: (
      req: Request,
      ctx: { params: Promise<Record<string, string | string[] | undefined>> }
    ) => Promise<Response>
  ) => handler,
}))

import { GET as getGoals, POST as createGoal } from '@/app/api/goals/route'
import {
  GET as getGoalById,
  PUT as updateGoal,
  DELETE as deleteGoal,
} from '@/app/api/goals/[id]/route'

const rootRouteContext = { params: Promise.resolve({}) }
const idRouteContext = (id: string) => ({ params: Promise.resolve({ id }) })

describe('/api/goals routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ENABLE_API_READ_CACHE
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('root GET returns goals for authenticated user', async () => {
    mockGoalService.getGoalsByUserId.mockResolvedValue([
      {
        id: 'goal-1',
        userId: 'user-1',
        title: 'Ship release',
        description: null,
        status: 'in-progress',
      },
    ])

    const response = await getGoals(
      new Request('http://localhost/api/goals'),
      rootRouteContext
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toHaveLength(1)
    expect(mockGoalService.getGoalsByUserId).toHaveBeenCalledWith('user-1')
  })

  it('root GET caches by user when ENABLE_API_READ_CACHE is true', async () => {
    process.env.ENABLE_API_READ_CACHE = 'true'
    mockGoalService.getGoalsByUserId.mockResolvedValue([
      { id: 'goal-1', userId: 'user-1', title: 'Ship release', description: null, status: 'in-progress' },
    ])

    await getGoals(new Request('http://localhost/api/goals'), rootRouteContext)
    await getGoals(new Request('http://localhost/api/goals'), rootRouteContext)

    expect(mockGoalService.getGoalsByUserId).toHaveBeenCalledTimes(1)
  })

  it('root POST validates invalid payload', async () => {
    const response = await createGoal(
      new Request('http://localhost/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      }),
      rootRouteContext
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
  })

  it('root POST creates goal with default status when omitted', async () => {
    mockGoalService.createGoal.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'Ship release',
      description: null,
      status: 'not-started',
    })

    const response = await createGoal(
      new Request('http://localhost/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Ship release' }),
      }),
      rootRouteContext
    )

    expect(response.status).toBe(201)
    expect(mockGoalService.createGoal).toHaveBeenCalledWith(
      {
        title: 'Ship release',
        description: null,
        status: 'not-started',
      },
      'user-1'
    )
  })

  it('id GET returns 404 when goal is missing', async () => {
    mockGoalService.getGoalById.mockResolvedValue(null)

    const response = await getGoalById(
      new Request('http://localhost/api/goals/goal-1'),
      idRouteContext('goal-1')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Goal not found' })
  })

  it('id PUT validates empty update body', async () => {
    const response = await updateGoal(
      new Request('http://localhost/api/goals/goal-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      idRouteContext('goal-1')
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
  })

  it('id PUT returns updated goal', async () => {
    mockGoalService.updateGoal.mockResolvedValue({
      id: 'goal-1',
      userId: 'user-1',
      title: 'Ship release',
      description: 'updated',
      status: 'completed',
    })

    const response = await updateGoal(
      new Request('http://localhost/api/goals/goal-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', description: 'updated' }),
      }),
      idRouteContext('goal-1')
    )

    expect(response.status).toBe(200)
    expect(mockGoalService.updateGoal).toHaveBeenCalledWith(
      'goal-1',
      { status: 'done', description: 'updated' },
      'user-1'
    )
  })

  it('id DELETE returns success when goal is deleted', async () => {
    mockGoalService.deleteGoal.mockResolvedValue(true)

    const response = await deleteGoal(
      new Request('http://localhost/api/goals/goal-1', { method: 'DELETE' }),
      idRouteContext('goal-1')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await getGoals(
      new Request('http://localhost/api/goals'),
      rootRouteContext
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
