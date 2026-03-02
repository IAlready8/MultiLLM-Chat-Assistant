import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetToken = vi.fn()

vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}))

import { middleware } from '@/middleware'

const originalAuthRequireLogin = process.env.AUTH_REQUIRE_LOGIN
const originalPublicAuthRequireLogin = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
const originalAuthSecret = process.env.AUTH_SECRET

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
    mockGetToken.mockResolvedValue(null)
  })

  afterEach(() => {
    setEnvVar('AUTH_REQUIRE_LOGIN', originalAuthRequireLogin)
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', originalPublicAuthRequireLogin)
    setEnvVar('NEXTAUTH_SECRET', originalNextAuthSecret)
    setEnvVar('AUTH_SECRET', originalAuthSecret)
  })

  it('allows requests through in non-strict mode', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')

    const request = new NextRequest('http://localhost:3000/api/conversations')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockGetToken).not.toHaveBeenCalled()
  })

  it('keeps /api/health public in strict mode', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')

    const request = new NextRequest('http://localhost:3000/api/health')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockGetToken).not.toHaveBeenCalled()
  })

  it('keeps /api/webhooks/stripe public in strict mode', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')

    const request = new NextRequest('http://localhost:3000/api/webhooks/stripe')
    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(mockGetToken).not.toHaveBeenCalled()
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
    expect(mockGetToken).not.toHaveBeenCalled()
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
    expect(mockGetToken).not.toHaveBeenCalled()
  })

  it('returns 401 for protected API routes in strict mode when token is missing and secret is present', async () => {
    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'true')
    setEnvVar('NEXTAUTH_SECRET', 'test-secret')

    const request = new NextRequest('http://localhost:3000/api/conversations')
    const response = await middleware(request)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockGetToken).toHaveBeenCalledTimes(1)
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
    expect(mockGetToken).toHaveBeenCalledTimes(1)
  })
})
