// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), database: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/prisma', () => {
  const delegate = { findUnique: mocks.database, findMany: mocks.database, create: mocks.database }
  const db = { providerConfig: delegate, goal: delegate, analytics: delegate, team: delegate }
  return { default: db, prisma: db }
})
import { isDeferredReleasePath } from '@/lib/release-scope'
import { POST as judge } from '@/app/api/jev/judge/route'
import { GET as config, PUT as saveConfig } from '@/app/api/jev/config/route'
import { POST as shadow } from '@/app/api/llm/decisions/shadow/route'
import { POST as execute } from '@/app/api/llm/decisions/execute/route'
import { POST as control } from '@/app/api/llm/decisions/control/route'
import { GET as goals, POST as createGoal } from '@/app/api/goals/route'
import { GET as teams, POST as createTeam } from '@/app/api/teams/route'
import { getSidecarDiagnostics } from '@/lib/sidecar-health'
import { isProviderOperational, isProviderDisabled } from '@/lib/provider-registry'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'user' } })
  vi.stubGlobal('fetch', vi.fn())
  vi.stubEnv('JEV_SHADOW_ENABLED', 'true')
  vi.stubEnv('JEV_AUTO_ROUTING_ENABLED', 'true')
  vi.stubEnv('TYPESAFE_API_KEY', 'operator-test-key')
  vi.stubEnv('ENABLE_TEAMS_API', 'true')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('fixed V1 scope', () => {
  it.each(['/api/jev/judge', '/api/llm/decisions/execute', '/api/teams/team', '/api/goals/one', '/pipeline', '/goal-hub', '/ai-roundtable'])('excludes exact paths and children (%s)', path => {
    expect(isDeferredReleasePath(path)).toBe(true)
  })
  it.each(['/api/llm/orchestrate', '/api/llm/stream', '/api/llm/decisions-extra', '/api/personas', '/multi-chat', '/comparison', '/settings', '/billing'])('keeps the comparison workspace (%s)', path => {
    expect(isDeferredReleasePath(path)).toBe(false)
  })
  it.each([judge, config, saveConfig, shadow, execute, control, goals, createGoal, teams, createTeam])('rejects direct handler access despite enabled environment flags (%#)', async handler => {
    const response = await handler(new Request('http://localhost/api', { method: 'POST', body: 'unparsed-body' }), { params: Promise.resolve({}) })
    expect(response.status).toBe(404)
    expect(mocks.database).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('preserves authentication on the disabled judge endpoint', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await judge(new Request('http://localhost'))).status).toBe(401)
  })
  it('does not probe a configured sidecar in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PYTHON_CORE_URL', 'https://sidecar.example')
    expect(await getSidecarDiagnostics()).toMatchObject({ status: 'disabled' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses the same production eligibility for local and deferred vendors', () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const provider of ['ollama', 'openrouter', 'grok', 'mistral', 'kimi', 'deepseek']) {
      expect(isProviderOperational(provider)).toBe(false)
      expect(isProviderDisabled(provider)).toBe(true)
    }
    for (const provider of ['openai', 'anthropic', 'googleai']) expect(isProviderOperational(provider)).toBe(true)
  })
})
