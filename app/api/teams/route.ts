import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { TeamService } from '@/services/team-service.db'
import { z } from 'zod'

const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
})

const isTeamsApiEnabled = () => process.env.ENABLE_TEAMS_API === 'true'

const teamsDisabledResponse = () =>
  NextResponse.json(
    {
      error: 'Teams API is not enabled',
      code: 'teams_api_disabled',
    },
    { status: 404 }
  )

/**
 * GET /api/teams
 * Retrieves all teams the authenticated user is a member of.
 */
export async function GET(req: Request) {
  if (!isTeamsApiEnabled()) return teamsDisabledResponse()

  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const teams = await TeamService.getTeamsByUserId(user.id)
  return NextResponse.json(teams)
}

/**
 * POST /api/teams
 * Creates a new team with the user as the OWNER.
 */
export async function POST(req: Request) {
  if (!isTeamsApiEnabled()) return teamsDisabledResponse()

  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await req.json()
  const validation = createTeamSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const newTeam = await TeamService.createTeam(validation.data.name, user.id)
    return NextResponse.json(newTeam, { status: 201 })
  } catch (error) {
    console.error('Error creating team:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}