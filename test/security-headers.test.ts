import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config.mjs'

type SecurityHeader = { key: string; value: string }
type HeaderRule = { source: string; headers: SecurityHeader[] }

const getCatchAllHeaders = async (): Promise<SecurityHeader[]> => {
  if (typeof nextConfig.headers !== 'function') {
    throw new Error('next.config.mjs must export an async headers() function')
  }

  const rules = (await nextConfig.headers()) as HeaderRule[]
  const catchAllRule = rules.find((rule) => rule.source === '/(.*)')
  if (!catchAllRule) {
    throw new Error('Expected a catch-all security-header rule')
  }

  return catchAllRule.headers
}

const getHeader = (headers: SecurityHeader[], key: string): SecurityHeader => {
  const header = headers.find((candidate) => candidate.key === key)
  if (!header) throw new Error(`Expected ${key} to be configured`)
  return header
}

describe('application security headers', () => {
  it('applies the non-transport security baseline to every route', async () => {
    const headers = await getCatchAllHeaders()

    expect(headers.map((header) => header.key)).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
      ]),
    )
  })

  it('uses a CSP that blocks framing and plugin objects', async () => {
    const csp = getHeader(await getCatchAllHeaders(), 'Content-Security-Policy')

    expect(csp.value).toContain("default-src 'self'")
    expect(csp.value).toContain("frame-ancestors 'none'")
    expect(csp.value).toContain("object-src 'none'")
  })

  it('does not claim HSTS ownership in the application config', async () => {
    const headers = await getCatchAllHeaders()

    expect(headers.map((header) => header.key)).not.toContain(
      'Strict-Transport-Security',
    )
  })

  it('sets the legacy frame and MIME protections', async () => {
    const headers = await getCatchAllHeaders()

    expect(getHeader(headers, 'X-Frame-Options').value).toBe('DENY')
    expect(getHeader(headers, 'X-Content-Type-Options').value).toBe('nosniff')
  })
})
