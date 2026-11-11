import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  quota: vi.fn(),
  findSubscription: vi.fn(),
  checkout: { value: true },
  session: { status: 'authenticated' as string },
  pathname: { value: '/multi-chat' },
}))

vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/llm-quota', () => ({ getLlmQuota: mocks.quota }))
vi.mock('@/lib/prisma', () => ({ default: { subscription: { findUnique: mocks.findSubscription } } }))
vi.mock('@/lib/stripe', () => ({
  get isStripeCheckoutConfigured() {
    return mocks.checkout.value
  },
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: mocks.session.status, data: null }) }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname.value }))

import { GET } from '@/app/api/account/usage/route'
import { UsageNotice } from '@/components/usage-notice'
import { selectUsageNotice, type UsageSnapshot } from '@/lib/usage-notice'

const RESET = '2026-12-01T00:00:00.000Z'
const snapshot = (over: Partial<UsageSnapshot> = {}): UsageSnapshot => ({
  tier: 'FREE',
  quota: { limit: 50, used: 10, remaining: 40, resetsAt: RESET },
  paymentNeedsAttention: false,
  canUpgrade: true,
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  mocks.checkout.value = true
  mocks.session.status = 'authenticated'
  mocks.pathname.value = '/multi-chat'
  mocks.auth.mockResolvedValue({ user: { id: 'user-1' } })
  mocks.quota.mockResolvedValue({ tier: 'FREE', limit: 50, used: 45, resetsAt: RESET })
  mocks.findSubscription.mockResolvedValue(null)
  window.sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('selectUsageNotice', () => {
  it('stays silent below 80 percent, with no allowance, and with no data', () => {
    expect(selectUsageNotice(snapshot())).toBeNull()
    expect(selectUsageNotice(snapshot({ quota: { limit: 50, used: 39, remaining: 11, resetsAt: RESET } }))).toBeNull()
    expect(selectUsageNotice(snapshot({ quota: null }))).toBeNull()
    expect(selectUsageNotice(null)).toBeNull()
  })

  it('warns from 80 percent and reports exhaustion at the limit', () => {
    expect(selectUsageNotice(snapshot({ quota: { limit: 50, used: 40, remaining: 10, resetsAt: RESET } }))).toEqual({ kind: 'low', used: 40, limit: 50, remaining: 10, canUpgrade: true })
    expect(selectUsageNotice(snapshot({ quota: { limit: 50, used: 50, remaining: 0, resetsAt: RESET } }))).toEqual({ kind: 'exhausted', limit: 50, resetsAt: RESET, canUpgrade: true })
    expect(selectUsageNotice(snapshot({ quota: { limit: 0, used: 0, remaining: 0, resetsAt: RESET } }))).toMatchObject({ kind: 'exhausted', limit: 0 })
  })

  it('puts a failed payment ahead of any usage state', () => {
    expect(selectUsageNotice(snapshot({ paymentNeedsAttention: true, quota: { limit: 50, used: 50, remaining: 0, resetsAt: RESET } }))).toEqual({ kind: 'payment' })
  })
})

describe('GET /api/account/usage', () => {
  it('requires a session', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect(mocks.quota).not.toHaveBeenCalled()
  })

  it('reports only the caller\'s allowance and never caches it', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      tier: 'FREE',
      quota: { limit: 50, used: 45, remaining: 5, resetsAt: RESET },
      paymentNeedsAttention: false,
      canUpgrade: true,
    })
    expect(mocks.quota).toHaveBeenCalledWith('user-1')
    expect(mocks.findSubscription).toHaveBeenCalledWith({ where: { userId: 'user-1' }, select: { stripeStatus: true, stripeSubscriptionId: true } })
  })

  it('never reports negative remaining allowance', async () => {
    mocks.quota.mockResolvedValue({ tier: 'FREE', limit: 50, used: 53, resetsAt: RESET })
    expect((await (await GET()).json()).quota.remaining).toBe(0)
  })

  it('reports no quota when none is enforced or the plan is unlimited', async () => {
    mocks.quota.mockResolvedValue(null)
    expect((await (await GET()).json()).quota).toBeNull()
    mocks.quota.mockResolvedValue({ tier: 'PRO', limit: null, used: 900, resetsAt: RESET })
    expect(await (await GET()).json()).toMatchObject({ tier: 'PRO', quota: null, canUpgrade: false })
  })

  it.each(['past_due', 'unpaid', 'incomplete', 'paused'])('flags a %s subscription as needing payment attention', async (stripeStatus) => {
    mocks.findSubscription.mockResolvedValue({ stripeStatus, stripeSubscriptionId: 'sub_1' })
    expect((await (await GET()).json()).paymentNeedsAttention).toBe(true)
  })

  it('does not flag healthy, cancelled or never-subscribed accounts', async () => {
    for (const row of [{ stripeStatus: 'active', stripeSubscriptionId: 'sub_1' }, { stripeStatus: 'canceled', stripeSubscriptionId: 'sub_1' }, { stripeStatus: 'past_due', stripeSubscriptionId: null }, null]) {
      mocks.findSubscription.mockResolvedValue(row)
      expect((await (await GET()).json()).paymentNeedsAttention).toBe(false)
    }
  })

  it('does not offer an upgrade when checkout is closed', async () => {
    mocks.checkout.value = false
    expect((await (await GET()).json()).canUpgrade).toBe(false)
  })

  it('fails with 503 and no internals when usage cannot be read', async () => {
    mocks.quota.mockRejectedValue(new Error('private database detail'))
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database detail')
  })
})

describe('UsageNotice', () => {
  const stubUsage = (value: UsageSnapshot | null, ok = true) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(value ?? { error: 'x' }), { status: ok ? 200 : 503 }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('renders nothing while usage is comfortable', async () => {
    const fetch = stubUsage(snapshot())
    render(<UsageNotice />)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account/usage', expect.objectContaining({ cache: 'no-store' })))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('shows remaining allowance with an upgrade link, and can be dismissed', async () => {
    stubUsage(snapshot({ quota: { limit: 2000, used: 1800, remaining: 200, resetsAt: RESET } }))
    const user = userEvent.setup()
    render(<UsageNotice />)
    expect(await screen.findByText('1,800 of 2,000 generations used this month. 200 left.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upgrade to Pro' })).toHaveAttribute('href', '/billing')
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('tells an exhausted account when the allowance resets and cannot be dismissed', async () => {
    stubUsage(snapshot({ tier: 'PRO', canUpgrade: false, quota: { limit: 50, used: 50, remaining: 0, resetsAt: RESET } }))
    render(<UsageNotice />)
    expect(await screen.findByText(/You have used all 50 generations.*resets on December 1/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('prompts for payment details when a payment failed', async () => {
    stubUsage(snapshot({ tier: 'PRO', paymentNeedsAttention: true }))
    render(<UsageNotice />)
    expect(await screen.findByText(/payment did not go through/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Update payment details' })).toHaveAttribute('href', '/billing')
  })

  it.each([
    ['signed out', 'unauthenticated', '/multi-chat'],
    ['on sign-in', 'authenticated', '/auth/signin'],
    ['on Billing', 'authenticated', '/billing'],
    ['on a public page', 'authenticated', '/pricing'],
  ])('does not fetch or render when %s', async (_label, status, pathname) => {
    const fetch = stubUsage(snapshot({ quota: { limit: 50, used: 50, remaining: 0, resetsAt: RESET } }))
    mocks.session.status = status
    mocks.pathname.value = pathname
    render(<UsageNotice />)
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('stays out of the way when the usage lookup fails', async () => {
    const failing = stubUsage(null, false)
    render(<UsageNotice />)
    await waitFor(() => expect(failing).toHaveBeenCalled())
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<UsageNotice />)
    await Promise.resolve()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
