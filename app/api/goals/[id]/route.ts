import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { GoalService } from '@/services/goal-service.db'
import {
  withApiMetrics,
  type MetricsRouteContext,
} from '@/lib/api-metrics-wrapper'

const goalStatusSchema = z.enum([
  'not-started',
  'in-progress',
  'completed',
  'delayed',
  'pending',
  'todo',
  'done',
  'active',
  'blocked',
])

const updateGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(10000).nullable().optional(),
    status: goalStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.status !== undefined,
    { message: 'At least one field must be provided' }
  )

const getGoalIdFromContext = async (
  ctx: MetricsRouteContext
): Promise<string> => {
  const rawId = (await ctx.params).id
  return Array.isArray(rawId) ? rawId[0] ?? '' : rawId ?? ''
}

/**
 * GET /api/goals/[id]
 * Returns one goal for the authenticated user.
 */
export const GET = withApiMetrics(async (
  _req: Request,
  ctx: MetricsRouteContext
) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck
  const id = await getGoalIdFromContext(ctx)

  try {
    const goal = await GoalService.getGoalById(id, user.id)
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    return NextResponse.json(goal)
  } catch (error) {
    console.error('Error loading goal:', error)
    return NextResponse.json({ error: 'Failed to load goal' }, { status: 500 })
  }
})

/**
 * PUT /api/goals/[id]
 * Updates one goal for the authenticated user.
 */
export const PUT = withApiMetrics(async (
  req: Request,
  ctx: MetricsRouteContext
) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck
  const id = await getGoalIdFromContext(ctx)

  const body = await req.json()
  const validation = updateGoalSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const updated = await GoalService.updateGoal(id, validation.data, user.id)
    if (!updated) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating goal:', error)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
})

/**
 * DELETE /api/goals/[id]
 * Deletes one goal for the authenticated user.
 */
export const DELETE = withApiMetrics(async (
  _req: Request,
  ctx: MetricsRouteContext
) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck
  const id = await getGoalIdFromContext(ctx)

  try {
    const deleted = await GoalService.deleteGoal(id, user.id)
    if (!deleted) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting goal:', error)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
})
