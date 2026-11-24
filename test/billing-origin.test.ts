// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/stripe', () => ({ StripeConfigurationError: class extends Error {} }))
import { getBillingOrigin } from '@/lib/billing-origin'
afterEach(() => vi.unstubAllEnvs())
describe('billing callback origin', () => {
  it.each(['', 'invalid', 'ftp://example.com', 'http://localhost:3000', 'https://localhost', 'http://example.com', 'https://u:p@example.com', 'https://example.com/path', 'https://example.com?next=x', 'https://example.com#x'])('fails closed in production (%s)', value => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_URL', value)
    expect(getBillingOrigin).toThrow(/valid NEXTAUTH_URL/)
  })
  it('uses a configured HTTPS origin without trusting request headers', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_URL', 'https://workspace.example')
    expect(getBillingOrigin().origin).toBe('https://workspace.example')
  })
  it('allows loopback HTTP only for local development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXTAUTH_URL', 'http://127.0.0.1:3001')
    expect(getBillingOrigin().origin).toBe('http://127.0.0.1:3001')
  })
})
