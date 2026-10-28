/**
 * Route-level coverage for the additive `q` search parameter on
 * GET /api/conversations.
 *
 * In its own file so the pre-existing conversations route suite is untouched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetConversationPage = vi.fn()
const mockGetConversationsByUserId = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/services/conversation-service.db', () => ({
  ConversationService: {
    getConversationPage: (...args: unknown[]) => mockGetConversationPage(...args),
    getConversationsByUserId: (...args: unknown[]) =>
      mockGetConversationsByUserId(...args),
  },
}))

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: vi.fn(),
}))

vi.mock('@/lib/api-metrics-wrapper', () => ({
  withApiMetrics: (
    handler: (
      req: Request,
      ctx: { params: Promise<Record<string, string | string[] | undefined>> }
    ) => Promise<Response>
  ) => handler,
}))

import { GET } from '@/app/api/conversations/route'

const routeContext = { params: Promise.resolve({}) }
const request = (url: string) => new Request(url)

describe('GET /api/conversations search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetConversationPage.mockResolvedValue({
      items: [],
      nextCursor: null,
      search: 'brief',
    })
    mockGetConversationsByUserId.mockResolvedValue([])
  })

  it('requires authentication', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET(
      request('http://localhost/api/conversations?q=brief'),
      routeContext
    )

    expect(response.status).toBe(401)
    expect(mockGetConversationPage).not.toHaveBeenCalled()
  })

  it('routes a q-only request to the paginated search branch', async () => {
    const response = await GET(
      request('http://localhost/api/conversations?q=pricing%20brief'),
      routeContext
    )

    expect(response.status).toBe(200)
    expect(mockGetConversationPage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ search: 'pricing brief', limit: 30 })
    )
    // A search result set must never be served from the cached full listing.
    expect(mockGetConversationsByUserId).not.toHaveBeenCalled()
  })

  it('serves search responses uncached', async () => {
    const response = await GET(
      request('http://localhost/api/conversations?q=brief'),
      routeContext
    )

    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('combines search with workspace and cursor', async () => {
    const cursor = Buffer.from(
      JSON.stringify({ id: 'c5', updatedAt: '2026-03-01T00:00:00.000Z' })
    ).toString('base64url')

    await GET(
      request(
        `http://localhost/api/conversations?q=brief&workspace=pipeline&cursor=${cursor}&limit=10`
      ),
      routeContext
    )

    expect(mockGetConversationPage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        search: 'brief',
        prefix: 'Pipeline:',
        limit: 10,
        cursor: { id: 'c5', updatedAt: '2026-03-01T00:00:00.000Z' },
      })
    )
  })

  it('keeps the cached full listing for a request with no parameters', async () => {
    await GET(request('http://localhost/api/conversations'), routeContext)

    expect(mockGetConversationsByUserId).toHaveBeenCalledWith('user-1')
    expect(mockGetConversationPage).not.toHaveBeenCalled()
  })

  it('treats a blank term as no search while still paginating', async () => {
    mockGetConversationPage.mockResolvedValue({ items: [], nextCursor: null })

    await GET(request('http://localhost/api/conversations?q=%20%20'), routeContext)

    expect(mockGetConversationPage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ search: undefined })
    )
  })

  it('rejects an over-long term with a 4xx rather than a server error', async () => {
    const term = 'x'.repeat(129)

    const response = await GET(
      request(`http://localhost/api/conversations?q=${term}`),
      routeContext
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toMatch(/too long/i)
    expect(mockGetConversationPage).not.toHaveBeenCalled()
  })

  it('returns the matched page to the caller', async () => {
    mockGetConversationPage.mockResolvedValue({
      items: [{ id: 'c1', title: 'Pricing brief', userId: 'user-1' }],
      nextCursor: 'next-token',
      search: 'brief',
    })

    const response = await GET(
      request('http://localhost/api/conversations?q=brief'),
      routeContext
    )
    const body = await response.json()

    expect(body.items).toHaveLength(1)
    expect(body.nextCursor).toBe('next-token')
    expect(body.search).toBe('brief')
  })
})
