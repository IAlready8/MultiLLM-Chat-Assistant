import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetParsedAnalyticsEvents = vi.fn()
const mockGetWorkflowMetrics = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/lib/demo-account', () => ({
  createGuestUserRecord: () => ({
    id: 'guest-local-user',
    email: 'guest@local.dev',
  }),
  getDemoAccountContext: () => ({
    id: 'demo-user',
    email: 'demo@local.dev',
  }),
}))

vi.mock('@/services/analytics-service', () => ({
  getParsedAnalyticsEvents: (userId?: string, days?: number) =>
    mockGetParsedAnalyticsEvents(userId, days),
  getWorkflowMetrics: (userId: string, days: number, events: unknown[]) =>
    mockGetWorkflowMetrics(userId, days, events),
  recordAnalyticsEvent: (event: unknown) => mockRecordAnalyticsEvent(event),
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
    mockGetWorkflowMetrics.mockResolvedValue({
      configuredProviders: 1,
      personas: 1,
      comparisonReadyConversations: 1,
      weeklySavedBriefComparisons: 1,
      conversationsCreated: 1,
      comparisonViews: 0,
      analyticsViews: 2,
    })
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
    expect(body.workflowMetrics).toMatchObject({
      configuredProviders: 1,
      weeklySavedBriefComparisons: 1,
      analyticsViews: 3,
    })
    expect(body.activationFunnel).toHaveLength(4)
    expect(body.meta).toMatchObject({
      source: 'live',
      eventCount: 2,
      attribution: {
        source: null,
        campaign: null,
        cohort: null,
      },
    })

    expect(mockGetParsedAnalyticsEvents).toHaveBeenCalledWith('user-1', 7)
    expect(mockGetWorkflowMetrics).toHaveBeenCalledWith(
      'user-1',
      7,
      expect.any(Array)
    )
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'analytics_viewed',
      userId: 'user-1',
      payload: { source: 'analytics', timeframe: '7d' },
    })
  })

  it('returns explicit empty telemetry payload for 24h timeframe', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([])

    const response = await GET(
      new Request('http://localhost/api/analytics?timeframe=24h'),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.timeframe).toBe('24h')
    expect(body.providerData).toEqual([])
    expect(body.modelComparisonData).toEqual([])
    expect(body.usageTrends).toHaveLength(24)
    expect(body.workflowMetrics.configuredProviders).toBe(1)
    expect(body.activationFunnel).toHaveLength(4)
    expect(body.totalStats).toEqual({
      totalRequests: 0,
      totalTokens: 0,
      totalErrors: 0,
      avgResponseTime: 0,
    })
    expect(body.meta).toEqual({
      source: 'empty',
      eventCount: 0,
      attribution: {
        source: null,
        campaign: null,
        cohort: null,
      },
    })
    expect(mockGetParsedAnalyticsEvents).toHaveBeenCalledWith('user-1', 1)
  })

  it('records comparison page views when source=comparison', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([])

    const response = await GET(
      new Request('http://localhost/api/analytics?timeframe=30d&source=comparison'),
      routeContext
    )

    expect(response.status).toBe(200)
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'comparison_viewed',
      userId: 'user-1',
      payload: { source: 'comparison', timeframe: '30d' },
    })
  })

  it('includes attribution metadata and attaches it to analytics view events', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([])

    const response = await GET(
      new Request('http://localhost/api/analytics?timeframe=7d&source=analytics', {
        headers: {
          cookie:
            'multillm_acquisition=%7B%22source%22%3A%22founder-outbound%22%2C%22campaign%22%3A%22agency-sprint%22%2C%22cohort%22%3A%22wave-1%22%7D',
        },
      }),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.meta.attribution).toEqual({
      source: 'founder-outbound',
      campaign: 'agency-sprint',
      cohort: 'wave-1',
    })
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'analytics_viewed',
      userId: 'user-1',
      payload: {
        source: 'analytics',
        timeframe: '7d',
        acquisitionSource: 'founder-outbound',
        acquisitionCampaign: 'agency-sprint',
        acquisitionCohort: 'wave-1',
      },
    })
  })

  it('returns empty guest telemetry without recording view events', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'guest-local-user', email: 'guest@local.dev' },
    })

    const response = await GET(
      new Request('http://localhost/api/analytics?timeframe=7d&source=analytics'),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.workflowMetrics).toMatchObject({
      configuredProviders: 0,
      personas: 0,
      comparisonReadyConversations: 0,
      weeklySavedBriefComparisons: 0,
    })
    expect(body.meta).toEqual({
      source: 'empty',
      eventCount: 0,
      attribution: {
        source: null,
        campaign: null,
        cohort: null,
      },
    })
    expect(mockGetParsedAnalyticsEvents).not.toHaveBeenCalled()
    expect(mockRecordAnalyticsEvent).not.toHaveBeenCalled()
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
