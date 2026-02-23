import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetParsedAnalyticsEvents = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/services/analytics-service', () => ({
  getParsedAnalyticsEvents: (userId?: string, days?: number) =>
    mockGetParsedAnalyticsEvents(userId, days),
}))

vi.mock('@/lib/api-metrics-wrapper', () => ({
  withApiMetrics: (
    handler: (
      req: Request,
      ctx: { params: Promise<Record<string, string | string[] | undefined>> }
    ) => Promise<Response>
  ) => handler,
}))

import { GET } from '@/app/api/analytics/route'

const routeContext = { params: Promise.resolve({}) }

describe('/api/analytics route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET(
      new Request('http://localhost/api/analytics'),
      routeContext
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockGetParsedAnalyticsEvents).not.toHaveBeenCalled()
  })

  it('builds analytics payload with default timeframe', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([
      {
        event: 'llm_request',
        userId: 'user-1',
        createdAt: new Date('2026-02-09T10:00:00.000Z'),
        payload: {
          provider: 'openai',
          model: 'gpt-4',
          tokens: 120,
          responseTime: 240,
        },
      },
      {
        event: 'llm_error',
        userId: 'user-1',
        createdAt: new Date('2026-02-09T10:10:00.000Z'),
        payload: {
          provider: 'openai',
          model: 'gpt-4',
        },
      },
    ])

    const response = await GET(
      new Request('http://localhost/api/analytics'),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.timeframe).toBe('7d')
    expect(body.providerData).toHaveLength(1)
    expect(body.providerData[0]).toMatchObject({
      provider: 'OpenAI',
      requests: 1,
      errors: 1,
      tokens: 120,
      avgResponseTime: 240,
    })
    expect(body.totalStats).toMatchObject({
      totalRequests: 1,
      totalErrors: 1,
      totalTokens: 120,
      avgResponseTime: 240,
    })
    expect(body.usageTrends).toHaveLength(7)
    expect(body.modelComparisonData.length).toBeGreaterThan(0)
    expect(body.meta).toMatchObject({ source: 'live', eventCount: 2 })

    expect(mockGetParsedAnalyticsEvents).toHaveBeenCalledWith('user-1', 7)
  })

  it('supports 24h timeframe and produces hourly trends', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([])

    const response = await GET(
      new Request('http://localhost/api/analytics?timeframe=24h'),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.timeframe).toBe('24h')
    expect(body.usageTrends).toHaveLength(24)
    expect(mockGetParsedAnalyticsEvents).toHaveBeenCalledWith('user-1', 1)
  })

  it('returns 500 when analytics service throws', async () => {
    mockGetParsedAnalyticsEvents.mockRejectedValue(new Error('boom'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(
      new Request('http://localhost/api/analytics'),
      routeContext
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load analytics dashboard',
    })

    consoleSpy.mockRestore()
  })
})
