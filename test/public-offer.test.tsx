import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  getProPrice: vi.fn(),
  readQuotaLimits: vi.fn(),
  checkout: { value: true },
}))

vi.mock('@/lib/billing-price', () => ({ getProPrice: mocks.getProPrice }))
vi.mock('@/lib/llm-quota', () => ({ readQuotaLimits: mocks.readQuotaLimits }))
vi.mock('@/lib/stripe', () => ({
  get isStripeCheckoutConfigured() {
    return mocks.checkout.value
  },
}))

import PricingPage from '@/app/pricing/page'
import SupportPage from '@/app/support/page'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'
import { getPublicOffer, resetPublicOfferCache } from '@/lib/public-pricing'

beforeEach(() => {
  vi.resetAllMocks()
  resetPublicOfferCache()
  mocks.checkout.value = true
  mocks.getProPrice.mockResolvedValue({ id: 'price_1', label: '$19.00 / month' })
  mocks.readQuotaLimits.mockReturnValue({ FREE: 50, PRO: 2000, ENTERPRISE: null })
  vi.stubEnv('SUPPORT_EMAIL', '')
  vi.stubEnv('NEXT_PUBLIC_APP_NAME', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('getPublicOffer', () => {
  it('returns the live price and enforced allowances', async () => {
    await expect(getPublicOffer()).resolves.toEqual({
      checkoutOpen: true,
      proPriceLabel: '$19.00 / month',
      allowances: { FREE: 50, PRO: 2000, ENTERPRISE: null },
    })
  })

  it('asks Stripe once for many concurrent and repeated anonymous requests', async () => {
    await Promise.all(Array.from({ length: 25 }, () => getPublicOffer()))
    await getPublicOffer()
    expect(mocks.getProPrice).toHaveBeenCalledTimes(1)
  })

  it('refreshes the price after ten minutes', async () => {
    let now = 1_000_000
    await getPublicOffer(() => now)
    now += 10 * 60 * 1000 - 1
    await getPublicOffer(() => now)
    expect(mocks.getProPrice).toHaveBeenCalledTimes(1)
    now += 2
    mocks.getProPrice.mockResolvedValue({ id: 'price_1', label: '$25.00 / month' })
    await expect(getPublicOffer(() => now)).resolves.toMatchObject({ proPriceLabel: '$25.00 / month' })
    expect(mocks.getProPrice).toHaveBeenCalledTimes(2)
  })

  it('closes checkout and backs off for a minute when the price cannot be read', async () => {
    let now = 5_000_000
    mocks.getProPrice.mockRejectedValue(new Error('stripe unavailable'))
    await expect(getPublicOffer(() => now)).resolves.toMatchObject({ checkoutOpen: false, proPriceLabel: null })
    await getPublicOffer(() => now + 59_000)
    expect(mocks.getProPrice).toHaveBeenCalledTimes(1)
    mocks.getProPrice.mockResolvedValue({ id: 'price_1', label: '$19.00 / month' })
    now += 60_001
    await expect(getPublicOffer(() => now)).resolves.toMatchObject({ checkoutOpen: true })
  })

  it('never calls Stripe when checkout is not configured', async () => {
    mocks.checkout.value = false
    await expect(getPublicOffer()).resolves.toMatchObject({ checkoutOpen: false, proPriceLabel: null })
    expect(mocks.getProPrice).not.toHaveBeenCalled()
  })

  it('states no allowance when the limit configuration cannot be read', async () => {
    mocks.readQuotaLimits.mockImplementation(() => {
      throw new Error('invalid limits')
    })
    await expect(getPublicOffer()).resolves.toMatchObject({ allowances: null })
  })
})

describe('pricing page', () => {
  it('shows the live price, both allowances and how to subscribe', async () => {
    render(await PricingPage())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Compare AI providers on your own briefs')
    expect(screen.getByText('$19.00 / month')).toBeInTheDocument()
    expect(screen.getByText('50 generations per month.')).toBeInTheDocument()
    expect(screen.getByText('2,000 generations per month.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in to subscribe' })).toHaveAttribute('href', '/auth/signin?callbackUrl=%2Fbilling')
    expect(screen.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/auth/register')
    expect(document.body.textContent).toContain('billed by that provider and are not included')
    expect(document.body.textContent).toContain('Attempts that fail or')
  })

  it('does not quote a price or offer checkout when paid plans are closed', async () => {
    mocks.checkout.value = false
    mocks.readQuotaLimits.mockReturnValue(null)
    render(await PricingPage())
    expect(screen.getByText('Not open yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in to subscribe' })).not.toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\$\d/)
    expect(text).not.toContain('generations per month')
    expect(text).not.toContain('Renews automatically')
  })

  it('offers a team contact only when a contact address is configured', async () => {
    const first = render(await PricingPage())
    expect(screen.queryByRole('link', { name: 'Contact us' })).not.toBeInTheDocument()
    first.unmount()
    vi.stubEnv('SUPPORT_EMAIL', 'sales@example.test')
    render(await PricingPage())
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', 'mailto:sales@example.test')
  })

  it('does not sell an enterprise plan', async () => {
    render(await PricingPage())
    expect(document.body.textContent).not.toContain('Enterprise')
  })
})

describe('support page', () => {
  it('covers the self-serve billing, data and account tasks', () => {
    render(<SupportPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    for (const phrase of ['Change or cancel a subscription', 'Download your data', 'Delete your account', 'each provider bills you directly']) {
      expect(text).toContain(phrase)
    }
    expect(screen.queryByRole('heading', { name: 'Contact' })).not.toBeInTheDocument()
  })

  it('shows the contact address when configured and warns against emailing secrets', () => {
    vi.stubEnv('SUPPORT_EMAIL', 'help@example.test')
    render(<SupportPage />)
    expect(screen.getByRole('link', { name: 'help@example.test' })).toHaveAttribute('href', 'mailto:help@example.test')
    expect(document.body.textContent).toContain('Never send an API key or password by email')
  })
})

describe('sitemap', () => {
  it('lists only public pages on the configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test')
    expect(sitemap().map((entry) => entry.url)).toEqual([
      'https://app.example.test/pricing',
      'https://app.example.test/terms',
      'https://app.example.test/privacy',
      'https://app.example.test/support',
    ])
    expect((robots() as { sitemap?: string }).sitemap).toBe('https://app.example.test/sitemap.xml')
  })

  it('is empty, and robots names no sitemap, when the origin is unknown', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXTAUTH_URL', '')
    expect(sitemap()).toEqual([])
    expect('sitemap' in robots()).toBe(false)
  })
})
