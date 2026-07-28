import { describe, expect, it } from 'vitest'

describe('next config security headers', () => {
  it('defines CSP and core security headers', async () => {
    const mod = await import('../next.config.mjs')
    const config = mod.default
    expect(config.headers).toBeTypeOf('function')
    const rules = await config.headers!()
    const rootRule = rules.find((rule: { source: string }) => rule.source === '/:path*')

    expect(rootRule).toBeDefined()
    if (!rootRule) {
      throw new Error('Missing root security header rule')
    }

    const headers = new Map(
      rootRule.headers.map((header: { key: string; value: string }) => [
        header.key,
        header.value,
      ])
    )

    expect(headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headers.get('Permissions-Policy')).toContain('camera=()')
  })
})
