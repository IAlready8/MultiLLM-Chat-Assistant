import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TermsPage from '@/app/terms/page'
import PrivacyPage from '@/app/privacy/page'
import { LegalConsentNotice } from '@/components/legal-consent-notice'
import { SiteFooter } from '@/components/site-footer'
import { formatLegalDate, getLegalDetails, LEGAL_LAST_UPDATED } from '@/lib/legal'
import { isPublicPagePath, PUBLIC_PAGE_PATHS } from '@/lib/public-routes'

afterEach(() => vi.unstubAllEnvs())

const clearLegalEnv = () => {
  vi.stubEnv('LEGAL_ENTITY_NAME', '')
  vi.stubEnv('SUPPORT_EMAIL', '')
  vi.stubEnv('LEGAL_GOVERNING_LAW', '')
  vi.stubEnv('NEXT_PUBLIC_APP_NAME', '')
}

describe('legal details', () => {
  it('never invents an operator, contact, or jurisdiction when none is configured', () => {
    clearLegalEnv()
    expect(getLegalDetails()).toEqual({
      productName: 'ManyOne',
      operatorName: null,
      contactEmail: null,
      governingLaw: null,
    })
  })

  it('reads configured values and rejects a malformed contact address', () => {
    vi.stubEnv('LEGAL_ENTITY_NAME', '  Example Labs Inc.  ')
    vi.stubEnv('LEGAL_GOVERNING_LAW', 'Example Province, Exampleland')
    vi.stubEnv('SUPPORT_EMAIL', 'support@example.test')
    expect(getLegalDetails()).toMatchObject({
      operatorName: 'Example Labs Inc.',
      contactEmail: 'support@example.test',
      governingLaw: 'Example Province, Exampleland',
    })
    vi.stubEnv('SUPPORT_EMAIL', 'javascript:alert(1)')
    expect(getLegalDetails().contactEmail).toBeNull()
    vi.stubEnv('SUPPORT_EMAIL', 'a@b.test"><script>')
    expect(getLegalDetails().contactEmail).toBeNull()
  })

  it('formats the published revision date independent of server time zone', () => {
    expect(formatLegalDate('2026-11-10')).toBe('November 10, 2026')
    expect(formatLegalDate('not-a-date')).toBe('not-a-date')
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('terms of service page', () => {
  it('states the commitments the product actually implements', () => {
    clearLegalEnv()
    render(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).toContain('You connect your own API keys')
    expect(text).toContain('renews automatically')
    expect(text).toContain('Deleting your account cancels your subscription immediately')
    expect(text).toContain('including attempts that fail or that you stop')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('omits governing law and contact clauses that have no configured value', () => {
    clearLegalEnv()
    render(<TermsPage />)
    expect(screen.queryByRole('heading', { name: /Governing law/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Contact/ })).not.toBeInTheDocument()
    expect(document.body.textContent).toContain('the operator of this service')
  })

  it('renders configured operator details with consecutive section numbers', () => {
    vi.stubEnv('LEGAL_ENTITY_NAME', 'Example Labs Inc.')
    vi.stubEnv('LEGAL_GOVERNING_LAW', 'Example Province, Exampleland')
    vi.stubEnv('SUPPORT_EMAIL', 'support@example.test')
    render(<TermsPage />)
    expect(document.body.textContent).toContain('Example Labs Inc.')
    expect(screen.getByRole('heading', { name: '14. Governing law' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '15. Contact' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'support@example.test' })).toHaveAttribute('href', 'mailto:support@example.test')
  })

  it('numbers the contact section 14 when no governing law is configured', () => {
    clearLegalEnv()
    vi.stubEnv('SUPPORT_EMAIL', 'support@example.test')
    render(<TermsPage />)
    expect(screen.getByRole('heading', { name: '14. Contact' })).toBeInTheDocument()
  })
})

describe('privacy policy page', () => {
  it('discloses the data flows that exist in the code', () => {
    clearLegalEnv()
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).toContain('AES-256-GCM')
    expect(text).toContain('Google or GitHub')
    expect(text).toContain('Stripe')
    expect(text).toContain('These records are linked to your account')
    expect(text).toContain('are sent to each provider you selected')
    expect(text).toContain('Permanently delete your account and its data from Settings')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })

  it('does not describe usage records as anonymous', () => {
    clearLegalEnv()
    render(<PrivacyPage />)
    expect((document.body.textContent ?? '').toLowerCase()).not.toContain('anonymous')
  })

  it('shows a contact section only when a contact address is configured', () => {
    clearLegalEnv()
    const { unmount } = render(<PrivacyPage />)
    expect(screen.queryByRole('heading', { name: /Contact/ })).not.toBeInTheDocument()
    unmount()
    vi.stubEnv('SUPPORT_EMAIL', 'privacy@example.test')
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { name: '12. Contact' })).toBeInTheDocument()
  })
})

describe('legal navigation', () => {
  it('links both documents from the consent notice and the footer', () => {
    render(
      <>
        <LegalConsentNotice />
        <SiteFooter />
      </>,
    )
    expect(screen.getAllByRole('link', { name: 'Terms of Service' })).toHaveLength(2)
    for (const link of screen.getAllByRole('link', { name: 'Privacy Policy' })) {
      expect(link).toHaveAttribute('href', '/privacy')
    }
    expect(screen.getByRole('navigation', { name: 'Site' })).toBeInTheDocument()
  })

  it('treats only the offer, legal and support pages as public', () => {
    expect([...PUBLIC_PAGE_PATHS]).toEqual(['/pricing', '/terms', '/privacy', '/support'])
    expect(isPublicPagePath('/pricing')).toBe(true)
    expect(isPublicPagePath('/support')).toBe(true)
    expect(isPublicPagePath('/terms')).toBe(true)
    expect(isPublicPagePath('/privacy/')).toBe(true)
    for (const path of ['/', '/settings', '/termsandmore', '/privacy-export', '/api/terms', '/billing', '/pricing-admin', '/supporters', '/api/pricing']) {
      expect(isPublicPagePath(path)).toBe(false)
    }
  })
})
