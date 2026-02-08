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

const createGoalSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().max(10000).optional(),
  status: goalStatusSchema.optional(),
})

/**
 * GET /api/goals
 * Returns all goals for the authenticated user.
 */
export async function GET(_req: Request) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const goals = await GoalService.getGoalsByUserId(user.id)
    return NextResponse.json(goals)
  } catch (error) {
    console.error('Error loading goals:', error)
    return NextResponse.json({ error: 'Failed to load goals' }, { status: 500 })
  }
}

/**
 * POST /api/goals
 * Creates a goal for the authenticated user.
 */
export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await req.json()
  const validation = createGoalSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const goal = await GoalService.createGoal(
      {
        title: validation.data.title,
        description: validation.data.description ?? null,
        status: validation.data.status ?? 'not-started',
      },
      user.id
    )

    return NextResponse.json(goal, { status: 201 })
  } catch (error) {
    console.error('Error creating goal:', error)
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
  }
}
