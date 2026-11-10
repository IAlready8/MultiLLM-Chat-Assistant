import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'
import { GET as securityTxt } from '@/app/.well-known/security.txt/route'
import { buildSiteMetadata, getSiteUrl } from '@/lib/site-metadata'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('robots policy', () => {
  it('keeps crawlers out of the private workspace and the API', () => {
    const [rule] = robots().rules as Array<{ userAgent: string; allow: string[]; disallow: string[] }>
    expect(rule.userAgent).toBe('*')
    expect(rule.disallow).toEqual(['/'])
    expect(rule.allow).toEqual(['/auth/signin', '/auth/register', '/pricing', '/terms', '/privacy', '/support'])
    expect(rule.allow.some((path) => path.startsWith('/api'))).toBe(false)
  })
})

describe('security.txt', () => {
  it('is not served without a configured contact address', async () => {
    vi.stubEnv('SUPPORT_EMAIL', '')
    const response = await securityTxt()
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('Contact:')
  })

  it('serves an RFC 9116 document with a future expiry when configured', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z'))
    vi.stubEnv('SUPPORT_EMAIL', 'security@example.test')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test/some/path')
    const response = await securityTxt()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toBe(
      [
        'Contact: mailto:security@example.test',
        'Expires: 2027-11-10T00:00:00.000Z',
        'Preferred-Languages: en',
        'Canonical: https://app.example.test/.well-known/security.txt',
        '',
      ].join('\n'),
    )
  })

  it('refuses a malformed contact value instead of publishing it', async () => {
    vi.stubEnv('SUPPORT_EMAIL', 'not an address\nContact: mailto:evil@example.test')
    expect((await securityTxt()).status).toBe(404)
  })
})

describe('site metadata', () => {
  it('resolves the public origin from configuration and ignores invalid values', () => {
    expect(getSiteUrl({ NEXT_PUBLIC_APP_URL: 'https://app.example.test/x?y=1' })?.toString()).toBe('https://app.example.test/')
    expect(getSiteUrl({ NEXT_PUBLIC_APP_URL: 'not a url', NEXTAUTH_URL: 'http://localhost:3000' })?.toString()).toBe('http://localhost:3000/')
    expect(getSiteUrl({ NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' })).toBeNull()
    expect(getSiteUrl({})).toBeNull()
  })

  it('builds titled, shareable metadata and omits metadataBase when no origin is known', () => {
    const configured = buildSiteMetadata({ NEXT_PUBLIC_APP_NAME: '  Example App  ', NEXTAUTH_URL: 'https://app.example.test' })
    expect(configured.title).toEqual({ default: 'Example App', template: '%s | Example App' })
    expect(configured.metadataBase?.toString()).toBe('https://app.example.test/')
    expect(configured.openGraph).toMatchObject({ siteName: 'Example App' })

    const bare = buildSiteMetadata({})
    expect(bare.title).toEqual({ default: 'ManyOne', template: '%s | ManyOne' })
    expect('metadataBase' in bare).toBe(false)
  })
})
