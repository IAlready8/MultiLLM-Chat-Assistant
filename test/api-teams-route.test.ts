import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetTeamsByUserId = vi.fn()
const mockCreateTeam = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/services/team-service.db', () => ({
  TeamService: {
    getTeamsByUserId: (userId: string) => mockGetTeamsByUserId(userId),
    createTeam: (name: string, userId: string) => mockCreateTeam(name, userId),
  },
}))

import { GET, POST } from '@/app/api/teams/route'

const originalEnableTeamsApi = process.env.ENABLE_TEAMS_API

const makePostRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/teams route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ENABLE_TEAMS_API
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  afterEach(() => {
    if (originalEnableTeamsApi === undefined) {
      delete process.env.ENABLE_TEAMS_API
    } else {
      process.env.ENABLE_TEAMS_API = originalEnableTeamsApi
    }
  })

  it('returns 404 without authenticating when teams API is not enabled', async () => {
    const response = await GET(new NextRequest('http://localhost/api/teams'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Teams API is not enabled',
      code: 'teams_api_disabled',
    })
    expect(mockGetAuthenticatedUser).not.toHaveBeenCalled()
    expect(mockGetTeamsByUserId).not.toHaveBeenCalled()
  })

  it('returns teams for the authenticated user when explicitly enabled', async () => {
    process.env.ENABLE_TEAMS_API = 'true'
    mockGetTeamsByUserId.mockResolvedValue([
      { id: 'team-1', name: 'Internal QA', _count: { members: 1 } },
    ])

    const response = await GET(new NextRequest('http://localhost/api/teams'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      { id: 'team-1', name: 'Internal QA', _count: { members: 1 } },
    ])
    expect(mockGetAuthenticatedUser).toHaveBeenCalledTimes(1)
    expect(mockGetTeamsByUserId).toHaveBeenCalledWith('user-1')
  })

  it('forwards auth failures when teams API is enabled', async () => {
    process.env.ENABLE_TEAMS_API = 'true'
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(makePostRequest({ name: 'Internal QA' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockCreateTeam).not.toHaveBeenCalled()
  })

  it('creates a team only when teams API is explicitly enabled', async () => {
    process.env.ENABLE_TEAMS_API = 'true'
    mockCreateTeam.mockResolvedValue({ id: 'team-1', name: 'Internal QA' })

    const response = await POST(makePostRequest({ name: 'Internal QA' }))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'team-1',
      name: 'Internal QA',
    })
    expect(mockCreateTeam).toHaveBeenCalledWith('Internal QA', 'user-1')
  })
})
