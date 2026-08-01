import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockDecode = vi.fn()

vi.mock('next-auth/jwt', () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}))

import { proxy as middleware } from '@/proxy'

const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
const originalAuthSecret = process.env.AUTH_SECRET
const originalAuthRequireLogin = process.env.AUTH_REQUIRE_LOGIN
const originalPublicAuthRequireLogin = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

describe('mandatory-auth routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecode.mockResolvedValue(null)
  })

  afterEach(() => {
    setEnvVar('NEXTAUTH_SECRET', originalNextAuthSecret)
    setEnvVar('AUTH_SECRET', originalAuthSecret)
    setEnvVar('AUTH_REQUIRE_LOGIN', originalAuthRequireLogin)
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', originalPublicAuthRequireLogin)
  })

  it.each([
    '/auth/signin',
    '/auth/register',
    '/api/auth/providers',
    '/api/health',
    '/api/webhooks/stripe',
  ])('keeps %s public', async (path) => {
    const response = await middleware(
      new NextRequest(`http://localhost:3000${path}`),
    )

    expect(response.status).toBe(200)
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('does not honor legacy flags that attempted to disable authentication', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const response = await middleware(
      new NextRequest('http://localhost:3000/api/conversations'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 for protected API routes when the auth secret is missing', async () => {
    setEnvVar('NEXTAUTH_SECRET', undefined)
    setEnvVar('AUTH_SECRET', undefined)

    const response = await middleware(
      new NextRequest('http://localhost:3000/api/conversations'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Server authentication is not configured.',
    })
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('redirects protected pages to the configuration error when the secret is missing', async () => {
    setEnvVar('NEXTAUTH_SECRET', undefined)
    setEnvVar('AUTH_SECRET', undefined)

    const response = await middleware(
      new NextRequest('http://localhost:3000/settings'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/error')
    expect(response.headers.get('location')).toContain('error=Configuration')
  })

  it('returns 401 for a protected API route without a session', async () => {
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const response = await middleware(
      new NextRequest('http://localhost:3000/api/conversations'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('redirects pages to sign-in with a local path and query callback', async () => {
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const response = await middleware(
      new NextRequest('http://localhost:3000/settings?tab=providers'),
    )

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('/auth/signin')
    expect(location).toContain(
      'callbackUrl=%2Fsettings%3Ftab%3Dproviders',
    )
  })

  it('decodes the secure NextAuth session cookie when present', async () => {
    setEnvVar('NEXTAUTH_SECRET', ' test-secret ')
    mockDecode.mockResolvedValue({ sub: 'user-123' })

    const request = new NextRequest('https://example.com/settings', {
      headers: {
        cookie:
          '__Secure-next-auth.session-token=secure-token-value; __Host-next-auth.csrf-token=csrf-token',
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockDecode).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'test-secret',
        token: 'secure-token-value',
      }),
    )
  })
})
