import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ limit: vi.fn(), warn: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }))

import { enforceRouteLimit } from '@/lib/route-rate-limit'

const base = { scope: 'test-scope', userId: 'user-1', max: 3, windowMs: 60_000 } as const

beforeEach(() => vi.resetAllMocks())

describe('enforceRouteLimit', () => {
  it('lets an allowed request through and keys the bucket per user', async () => {
    mocks.limit.mockResolvedValue({ allowed: true })
    await expect(enforceRouteLimit({ ...base, onUnavailable: 'deny' })).resolves.toBeNull()
    expect(mocks.limit).toHaveBeenCalledWith('test-scope:user-1', { max: 3, windowMs: 60_000 })
  })

  it('returns 429 with a Retry-After header rounded up to whole seconds', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterMs: 1_200 })
    const response = await enforceRouteLimit({ ...base, onUnavailable: 'deny' })
    expect(response?.status).toBe(429)
    expect(response?.headers.get('retry-after')).toBe('2')
    expect(response?.headers.get('cache-control')).toBe('no-store')
    await expect(response?.json()).resolves.toEqual({ error: 'Too many requests. Please wait a moment and try again.' })
  })

  it('falls back to the window length when the limiter reports no retry delay', async () => {
    mocks.limit.mockResolvedValue({ allowed: false })
    const response = await enforceRouteLimit({ ...base, onUnavailable: 'deny' })
    expect(response?.headers.get('retry-after')).toBe('60')
  })

  it('merges a caller-specific error shape', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterMs: 1 })
    const response = await enforceRouteLimit({
      ...base,
      onUnavailable: 'deny',
      errorBody: (message) => ({ valid: false, message }),
    })
    await expect(response?.json()).resolves.toMatchObject({ valid: false, message: expect.stringContaining('Too many requests') })
  })

  it('fails closed with 503 when the backend is unavailable and the route denies', async () => {
    mocks.limit.mockRejectedValue(new Error('private redis detail'))
    const response = await enforceRouteLimit({ ...base, onUnavailable: 'deny' })
    expect(response?.status).toBe(503)
    expect(await response?.text()).not.toContain('private redis detail')
  })

  it('fails open and logs when the backend is unavailable and the route allows', async () => {
    mocks.limit.mockRejectedValue(new Error('limiter backend unavailable'))
    await expect(enforceRouteLimit({ ...base, onUnavailable: 'allow' })).resolves.toBeNull()
    expect(mocks.warn).toHaveBeenCalledWith('route_rate_limit_unavailable_allowed', { scope: 'test-scope' })
  })
})
