import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockDecode = vi.fn()

vi.mock('next-auth/jwt', () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}))

import { proxy as middleware } from '@/proxy'

const originalAuthRequireLogin = process.env.AUTH_REQUIRE_LOGIN
const originalPublicAuthRequireLogin = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
const originalAuthSecret = process.env.AUTH_SECRET
const originalNodeEnv = process.env.NODE_ENV

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

describe('middleware strict-auth routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecode.mockResolvedValue(null)
  })

  afterEach(() => {
    setEnvVar('AUTH_REQUIRE_LOGIN', originalAuthRequireLogin)
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', originalPublicAuthRequireLogin)
    setEnvVar('NEXTAUTH_SECRET', originalNextAuthSecret)
    setEnvVar('AUTH_SECRET', originalAuthSecret)
    setEnvVar('NODE_ENV', originalNodeEnv)
  })

  it('allows requests through in non-strict mode', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')

    const request = new NextRequest('http://localhost:3000/api/conversations')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('keeps /api/health public in strict mode', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')

    const request = new NextRequest('http://localhost:3000/api/health')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('keeps /api/webhooks/stripe public in strict mode', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('returns 500 for protected API routes in strict mode when auth secret is missing', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXTAUTH_SECRET', undefined)
    setEnvVar('AUTH_SECRET', undefined)

    const request = new NextRequest('http://localhost:3000/api/conversations')
    const response = await middleware(request)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Server authentication is not configured.',
    })
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('redirects page routes to auth/error in strict mode when auth secret is missing', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXTAUTH_SECRET', undefined)
    setEnvVar('AUTH_SECRET', undefined)

    const request = new NextRequest('http://localhost:3000/settings')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/error')
    expect(response.headers.get('location')).toContain('error=Configuration')
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('returns 401 for protected API routes in strict mode when token is missing and secret is present', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const request = new NextRequest('http://localhost:3000/api/conversations')
    const response = await middleware(request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('enforces strict auth in production even when strict flags are false', async () => {
    setEnvVar('NODE_ENV', 'production')
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const request = new NextRequest('http://localhost:3000/api/conversations')
    const response = await middleware(request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('redirects page routes to sign-in in strict mode when token is missing and secret is present', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const request = new NextRequest('http://localhost:3000/settings')
    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/auth/signin')
    expect(response.headers.get('location')).toContain('callbackUrl=%2Fsettings')
    expect(mockDecode).not.toHaveBeenCalled()
  })

  it('decodes the secure NextAuth session cookie when present', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')
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
      })
    )
  })
})
