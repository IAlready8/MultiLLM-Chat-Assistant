import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { mockGetAuthenticatedUser, mockRecordAnalyticsEvent, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockGetAuthenticatedUser: vi.fn(),
    mockRecordAnalyticsEvent: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }))

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: (payload: unknown) => mockRecordAnalyticsEvent(payload),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: (event: string, payload: unknown) => mockLoggerWarn(event, payload),
  },
}))

import { POST } from '@/app/api/billing/view/route'

describe('/api/billing/view route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    })
    mockRecordAnalyticsEvent.mockResolvedValue(undefined)
  })

  it('forwards auth response', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await POST(new Request('http://localhost/api/billing/view'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('records billing view analytics with billing_page source by default', async () => {
    const response = await POST(new Request('http://localhost/api/billing/view'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'billing_viewed',
      userId: 'user-1',
      payload: { source: 'billing_page' },
    })
  })

  it('swallows analytics failures and logs a warning', async () => {
    mockRecordAnalyticsEvent.mockRejectedValue(new Error('analytics unavailable'))

    const response = await POST(
      new Request('http://localhost/api/billing/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })
    )

    expect(response.status).toBe(200)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'billing_view_analytics_failed',
      expect.objectContaining({
        route: '/api/billing/view',
        userId: 'user-1',
        error: expect.any(Error),
      })
    )
  })
})
