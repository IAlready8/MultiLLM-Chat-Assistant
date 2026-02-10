import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetErrorStats = vi.fn()
const mockGetParsedAnalyticsEvents = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/error-system', () => ({
  errorManager: {
    getErrorStats: (options: { from: Date; to: Date }) => mockGetErrorStats(options),
  },
}))

vi.mock('@/services/analytics-service', () => ({
  getParsedAnalyticsEvents: (userId?: string, days?: number) =>
    mockGetParsedAnalyticsEvents(userId, days),
}))

import { POST } from '@/app/api/admin/errors/stats/route'

describe('/api/admin/errors/stats route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1' },
    })
    mockGetErrorStats.mockResolvedValue({
      total: 1,
      byCategory: {
        database: 1,
      },
      bySeverity: {
        critical: 1,
      },
      topErrors: [{ code: 'DATABASE_ERROR', count: 1 }],
    })
    mockGetParsedAnalyticsEvents.mockResolvedValue([])
  })

  it('forwards auth failure response', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(
      new Request('http://localhost/api/admin/errors/stats', {
        method: 'POST',
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 when from is after to', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/errors/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '2026-02-10T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid date range: "from" must be before "to".',
    })
  })

  it('merges critical app errors with llm_error analytics events', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([
      {
        event: 'llm_error',
        userId: 'user-1',
        createdAt: new Date('2026-02-05T12:00:00.000Z'),
        payload: {
          reason: 'unreachable',
          status: 503,
          code: 'UPSTREAM_DOWN',
        },
      },
      {
        event: 'llm_error',
        userId: 'user-1',
        createdAt: new Date('2026-02-05T13:00:00.000Z'),
        payload: {
          reason: 'rate_limited',
          status: 429,
          code: 'RATE_LIMITED',
        },
      },
    ])

    const response = await POST(
      new Request('http://localhost/api/admin/errors/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-02-10T00:00:00.000Z',
        }),
      })
    )

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.total).toBe(3)
    expect(payload.byCategory.database).toBe(1)
    expect(payload.byCategory.network).toBe(1)
    expect(payload.byCategory.provider).toBe(1)
    expect(payload.bySeverity.critical).toBe(1)
    expect(payload.bySeverity.high).toBe(1)
    expect(payload.bySeverity.medium).toBe(1)
    expect(payload.topErrors).toEqual(
      expect.arrayContaining([
        { code: 'DATABASE_ERROR', count: 1 },
        { code: 'UPSTREAM_DOWN', count: 1 },
        { code: 'RATE_LIMITED', count: 1 },
      ])
    )
  })
})
