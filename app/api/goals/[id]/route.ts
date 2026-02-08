import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { GoalService } from '@/services/goal-service.db'

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

/**
 * GET /api/goals/[id]
 * Returns one goal for the authenticated user.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const goal = await GoalService.getGoalById(params.id, user.id)
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    return NextResponse.json(goal)
  } catch (error) {
    console.error('Error loading goal:', error)
    return NextResponse.json({ error: 'Failed to load goal' }, { status: 500 })
  }
}

/**
 * PUT /api/goals/[id]
 * Updates one goal for the authenticated user.
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await req.json()
  const validation = updateGoalSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const updated = await GoalService.updateGoal(params.id, validation.data, user.id)
    if (!updated) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating goal:', error)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}

/**
 * DELETE /api/goals/[id]
 * Deletes one goal for the authenticated user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const deleted = await GoalService.deleteGoal(params.id, user.id)
    if (!deleted) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting goal:', error)
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 })
  }
}
