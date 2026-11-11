import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ limit: vi.fn(), warn: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { enforceWorkspaceWriteLimit } from '@/lib/route-rate-limit'

beforeEach(() => vi.resetAllMocks())

describe('enforceWorkspaceWriteLimit', () => {
  it('uses one shared per-user bucket of 240 writes a minute', async () => {
    mocks.limit.mockResolvedValue({ allowed: true })
    await expect(enforceWorkspaceWriteLimit('user-1')).resolves.toBeNull()
    expect(mocks.limit).toHaveBeenCalledWith('workspace-write:user-1', { max: 240, windowMs: 60_000 })
  })

  it('returns 429 with Retry-After once the ceiling is reached', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterMs: 12_000 })
    const response = await enforceWorkspaceWriteLimit('user-1')
    expect(response?.status).toBe(429)
    expect(response?.headers.get('retry-after')).toBe('12')
  })

  it('never blocks saving work because the limiter backend is down', async () => {
    mocks.limit.mockRejectedValue(new Error('limiter backend unavailable'))
    await expect(enforceWorkspaceWriteLimit('user-1')).resolves.toBeNull()
    expect(mocks.warn).toHaveBeenCalledWith('route_rate_limit_unavailable_allowed', { scope: 'workspace-write' })
  })
})

// Every mutating workspace handler must check the ceiling right after it has
// identified the caller, and no read handler may spend from it.
const HANDLERS: Record<string, { limited: string[]; open: string[] }> = {
  'app/api/conversations/route.ts': { limited: ['POST'], open: ['GET'] },
  'app/api/conversations/[id]/route.ts': { limited: ['POST', 'PUT', 'DELETE'], open: ['GET'] },
  'app/api/personas/route.ts': { limited: ['POST'], open: ['GET'] },
  'app/api/personas/[id]/route.ts': { limited: ['PUT', 'DELETE'], open: ['GET'] },
  'app/api/goals/route.ts': { limited: ['POST'], open: ['GET'] },
  'app/api/goals/[id]/route.ts': { limited: ['PUT', 'DELETE'], open: ['GET'] },
  'app/api/provider-configs/route.ts': { limited: ['POST', 'PUT', 'DELETE'], open: ['GET'] },
  'app/api/jev/config/route.ts': { limited: ['PUT', 'DELETE'], open: ['GET'] },
  'app/api/account/profile/route.ts': { limited: ['PATCH'], open: ['GET'] },
}

const handlerSource = (source: string, method: string): string => {
  const start = source.search(new RegExp(`export (?:const ${method} = withApiMetrics\\(async|async function ${method})\\b`))
  if (start < 0) throw new Error(`handler ${method} not found`)
  const rest = source.slice(start + 10)
  const next = rest.search(/\nexport /)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('workspace write handlers', () => {
  it.each(Object.entries(HANDLERS))('%s throttles writes and leaves reads alone', (file, { limited, open }) => {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8')
    for (const method of limited) {
      const body = handlerSource(source, method)
      const authAt = body.search(/getAuthenticatedUser\(\)/)
      const limitAt = body.indexOf('enforceWorkspaceWriteLimit(')
      expect(authAt, `${file} ${method} authenticates`).toBeGreaterThanOrEqual(0)
      expect(limitAt, `${file} ${method} is throttled`).toBeGreaterThan(authAt)
      expect(body).toContain('if (writeLimited) return writeLimited')
    }
    for (const method of open) {
      expect(handlerSource(source, method)).not.toContain('enforceWorkspaceWriteLimit(')
    }
  })
})
