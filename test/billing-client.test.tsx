import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from './test-utils'
import userEvent from '@testing-library/user-event'
import { BillingClient } from '@/app/billing/billing-client'
import {
  BILLING_PLANS,
  FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE,
} from '@/lib/billing-plans'

const replaceLocation = (href = 'http://localhost/billing') => {
  const location = {
    href,
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  }

  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: location,
  })

  return location
}

describe('BillingClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    replaceLocation()
  })

  it('shows upgrade guidance for free users at the weekly comparison threshold', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <BillingClient
        tier="FREE"
        periodEnd={null}
        plans={BILLING_PLANS}
        freePlanWeeklySavedBriefGuidance={FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE}
        weeklySavedBriefComparisons={3}
        checkoutEnabled={true}
        portalEnabled={true}
      />
    )

    expect(await screen.findByText('Upgrade to Pro')).toBeInTheDocument()
    expect(
      screen.getByText(/free-plan guidance threshold has been reached/i)
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/billing/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })
    })
  })

  it('starts checkout from the billing page for free users', async () => {
    const user = userEvent.setup()
    const location = replaceLocation()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://stripe.test/checkout' }),
      })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <BillingClient
        tier="FREE"
        periodEnd={null}
        plans={BILLING_PLANS}
        freePlanWeeklySavedBriefGuidance={FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE}
        weeklySavedBriefComparisons={1}
        checkoutEnabled={true}
        portalEnabled={true}
      />
    )

    await user.click(await screen.findByRole('button', { name: 'Upgrade to Pro' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })
      expect(location.href).toBe('https://stripe.test/checkout')
    })
  })

  it('opens the billing portal for pro users', async () => {
    const user = userEvent.setup()
    const location = replaceLocation()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://stripe.test/portal' }),
      })

    vi.stubGlobal('fetch', fetchMock)

    render(
      <BillingClient
        tier="PRO"
        periodEnd="2026-04-01T00:00:00.000Z"
        plans={BILLING_PLANS}
        freePlanWeeklySavedBriefGuidance={FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE}
        weeklySavedBriefComparisons={5}
        checkoutEnabled={true}
        portalEnabled={true}
      />
    )

    await user.click(
      await screen.findByRole('button', { name: 'Manage Subscription' })
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/subscriptions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })
      expect(location.href).toBe('https://stripe.test/portal')
    })
  })
  it('shows each plan\'s enforced monthly allowance and customer-facing billing terms', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))

    render(
      <BillingClient
        tier="FREE"
        periodEnd={null}
        plans={BILLING_PLANS}
        freePlanWeeklySavedBriefGuidance={FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE}
        weeklySavedBriefComparisons={0}
        checkoutEnabled={true}
        portalEnabled={true}
        proPriceLabel="$10 / month"
        planAllowances={{ FREE: 50, PRO: 2000, ENTERPRISE: null }}
      />
    )

    expect(await screen.findByText('50 generations per month.')).toBeInTheDocument()
    expect(screen.getByText('2,000 generations per month.')).toBeInTheDocument()
    expect(screen.getByText('Unlimited generations per month.')).toBeInTheDocument()
    expect(screen.getByText('$10 / month')).toBeInTheDocument()
    expect(screen.getByText('Billed by subscription. Cancel any time from this page.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('stripe-self-serve')
    expect(text).not.toContain('sales-led')
    expect(text).not.toContain('Operator-managed')
  })

  it('states no allowance when the server is not enforcing one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }))

    render(
      <BillingClient
        tier="FREE"
        periodEnd={null}
        plans={BILLING_PLANS}
        freePlanWeeklySavedBriefGuidance={FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE}
        weeklySavedBriefComparisons={0}
        checkoutEnabled={true}
        portalEnabled={true}
        planAllowances={null}
      />
    )

    expect(await screen.findByText('Upgrade to Pro')).toBeInTheDocument()
    expect(screen.queryByText(/generations per month/)).not.toBeInTheDocument()
  })
})
