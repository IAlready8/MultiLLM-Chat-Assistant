// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLegalPublication, isPaidSignupEnabled } from '@/lib/legal-publication'
import { legalDocument } from '@/lib/legal-document'

afterEach(() => vi.unstubAllEnvs())
describe('legal publication and paid signup', () => {
  it.each(['terms', 'privacy', 'support'] as const)('keeps unpublished %s details out of the response', async kind => {
    vi.stubEnv('LEGAL_NOTICE_APPROVED', 'false')
    vi.stubEnv('LEGAL_OPERATOR_NAME', '[UNCONFIRMED — DRAFT ONLY]')
    vi.stubEnv('SUPPORT_EMAIL', 'invented@example.com')
    const response = legalDocument(kind)
    const html = await response.text()
    expect(response.status).toBe(503)
    expect(html).toContain('Paid signup is not open')
    expect(html).not.toContain('invented@example.com')
    expect(html).not.toContain('UNCONFIRMED')
    expect(isPaidSignupEnabled()).toBe(false)
  })
  it('requires approval, a confirmed identity/contact and backup retention before publication', async () => {
    vi.stubEnv('LEGAL_NOTICE_APPROVED', 'true')
    vi.stubEnv('LEGAL_OPERATOR_NAME', 'Synthetic operator for unit testing')
    vi.stubEnv('SUPPORT_EMAIL', 'unit@unit.example')
    vi.stubEnv('LEGAL_BACKUP_RETENTION_HOURS', '6')
    expect(readLegalPublication()).toMatchObject({ backupHours: 6 })
    const html = await legalDocument('privacy').text()
    expect(html).toContain('6 hours')
    expect(html).toContain('90 days')
    expect(isPaidSignupEnabled()).toBe(false)
    vi.stubEnv('PAID_SIGNUP_ENABLED', 'true')
    expect(isPaidSignupEnabled()).toBe(true)
    vi.stubEnv('SUPPORT_EMAIL', 'support@example.com')
    expect(readLegalPublication()).toBeNull()
    expect(isPaidSignupEnabled()).toBe(false)
  })
  it('escapes operator-controlled text rather than injecting markup', async () => {
    vi.stubEnv('LEGAL_NOTICE_APPROVED', 'true')
    vi.stubEnv('LEGAL_OPERATOR_NAME', '<script>not markup</script>')
    vi.stubEnv('SUPPORT_EMAIL', 'unit@unit.example')
    vi.stubEnv('LEGAL_BACKUP_RETENTION_HOURS', '6')
    const html = await legalDocument('terms').text()
    expect(html).toContain('&lt;script&gt;not markup&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
