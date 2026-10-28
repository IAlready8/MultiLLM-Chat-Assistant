/**
 * Route-level coverage for the additive `costBreakdown` field.
 *
 * Kept in its own file rather than appended to
 * `test/api-analytics-route.test.ts` so the pre-existing analytics route suite
 * stays exactly as it was; this file stubs the cost service, which that suite
 * deliberately does not.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAuthenticatedUser = vi.fn()
const mockGetParsedAnalyticsEvents = vi.fn()
const mockGetWorkflowMetrics = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()
const mockGetGenerationCostSummary = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/services/analytics-service', () => ({
  getParsedAnalyticsEvents: (userId?: string, days?: number) =>
    mockGetParsedAnalyticsEvents(userId, days),
  getWorkflowMetrics: (userId: string, days: number, events: unknown[]) =>
    mockGetWorkflowMetrics(userId, days, events),
  recordAnalyticsEvent: (event: unknown) => mockRecordAnalyticsEvent(event),
}))

vi.mock('@/services/generation-cost-service', () => ({
  getGenerationCostSummary: (userId: string, days: number) =>
    mockGetGenerationCostSummary(userId, days),
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

const summary = (overrides: Record<string, unknown> = {}) => ({
  windowDays: 7,
  generations: 2,
  promptTokens: 1_000_000,
  completionTokens: 500_000,
  inputUsd: 2.5,
  outputUsd: 5,
  totalUsd: 7.5,
  rows: [
    {
      provider: 'openai',
      model: 'gpt-4o',
      generations: 2,
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      inputUsd: 2.5,
      outputUsd: 5,
      totalUsd: 7.5,
      precision: 'model',
      providerReportedShare: 1,
    },
  ],
  truncated: false,
  providerReportedShare: 1,
  empty: false,
  degraded: false,
  basis: 'Published list prices applied to recorded token counts. Estimate only, not an invoice.',
  ...overrides,
})

describe('/api/analytics costBreakdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetParsedAnalyticsEvents.mockResolvedValue([])
    mockGetWorkflowMetrics.mockResolvedValue({
      configuredProviders: 1,
      personas: 1,
      comparisonReadyConversations: 1,
      weeklySavedBriefComparisons: 1,
      conversationsCreated: 1,
      comparisonViews: 0,
      analyticsViews: 2,
      billingViews: 0,
      checkoutSessionsCreated: 0,
      portalSessionsCreated: 0,
    })
    mockGetGenerationCostSummary.mockResolvedValue(summary())
  })

  it('exposes the per-model cost breakdown on the payload', async () => {
    const response = await GET(
      new Request('http://localhost/api/analytics'),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.costBreakdown).toMatchObject({
      totalUsd: 7.5,
      inputUsd: 2.5,
      outputUsd: 5,
      degraded: false,
    })
    expect(body.costBreakdown.rows[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      precision: 'model',
    })
    expect(body.costBreakdown.basis).toMatch(/not an invoice/i)
  })

  it('passes the selected timeframe window through to the cost service', async () => {
    await GET(
      new Request('http://localhost/api/analytics?timeframe=30d'),
      routeContext
    )

    expect(mockGetGenerationCostSummary).toHaveBeenCalledWith('user-1', 30)
  })

  it('keeps the pre-existing blended provider cost field intact', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([
      {
        event: 'llm_request',
        userId: 'user-1',
        createdAt: new Date(),
        payload: { provider: 'openai', model: 'gpt-4o', tokens: 1_000_000 },
      },
    ])

    const response = await GET(
      new Request('http://localhost/api/analytics'),
      routeContext
    )
    const body = await response.json()

    // Backwards compatibility: the older blended estimate is still reported
    // alongside the new per-model figure, so existing consumers are unaffected.
    expect(body.providerData[0].estimatedCostUsd).toBe(5)
    expect(body.providerData[0].estimatedCostBasis).toBe(
      'Blended estimate, not for billing'
    )
  })

  it('surfaces a degraded cost read without failing the dashboard', async () => {
    mockGetGenerationCostSummary.mockResolvedValue(
      summary({
        degraded: true,
        empty: false,
        generations: 0,
        promptTokens: 0,
        completionTokens: 0,
        inputUsd: 0,
        outputUsd: 0,
        totalUsd: 0,
        rows: [],
        providerReportedShare: 0,
      })
    )

    const response = await GET(
      new Request('http://localhost/api/analytics'),
      routeContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.costBreakdown.degraded).toBe(true)
    expect(body.costBreakdown.empty).toBe(false)
  })
})
