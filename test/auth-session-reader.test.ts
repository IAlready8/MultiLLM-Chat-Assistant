import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
process.env.NEXTAUTH_SECRET = 'test-secret'

const mockCookies = vi.fn()
const mockDecode = vi.fn()

vi.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}))

vi.mock('next-auth', () => ({
  default: vi.fn(() => vi.fn()),
}))

vi.mock('next-auth/jwt', () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn(() => ({ id: 'credentials', name: 'Credentials' })),
}))

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({ id: 'google', name: 'Google' })),
}))

vi.mock('next-auth/providers/github', () => ({
  default: vi.fn(() => ({ id: 'github', name: 'GitHub' })),
}))

vi.mock('@next-auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => undefined),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAndConsume: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('@/lib/startup-validation', () => ({
  validateStartupEnvironment: vi.fn(),
}))

vi.mock('@/lib/demo-account', () => ({
  createDemoAuthUser: vi.fn(),
  getDemoAccountContext: () => ({
    enabled: false,
    bypassAuth: false,
    id: 'demo-user',
    name: 'Demo User',
    email: 'demo@example.com',
    password: 'demo-password',
  }),
  isInMemoryAuthFallbackAllowed: () => false,
  isDemoCredentials: () => false,
  isDemoEmail: () => false,
  isStrictAuthRequired: () => true,
}))

const { auth, readSessionTokenFromCookieStore } = await import('@/lib/auth')

afterAll(() => {
  process.env.NEXTAUTH_SECRET = originalNextAuthSecret
})

describe('auth session token reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the secure session cookie directly', () => {
    const cookieStore = {
      getAll: () => [
        {
          name: '__Secure-next-auth.session-token',
          value: 'secure-token-value',
        },
      ],
    }

    expect(readSessionTokenFromCookieStore(cookieStore as never)).toBe(
      'secure-token-value'
    )
  })

  it('reassembles chunked secure session cookies', () => {
    const cookieStore = {
      getAll: () => [
        {
          name: '__Secure-next-auth.session-token.1',
          value: 'second',
        },
        {
          name: '__Secure-next-auth.session-token.0',
          value: 'first-',
        },
      ],
    }

    expect(readSessionTokenFromCookieStore(cookieStore as never)).toBe(
      'first-second'
    )
  })

  it('decodes a secure session cookie into an app session', async () => {
    mockCookies.mockResolvedValue({
      getAll: () => [
        {
          name: '__Secure-next-auth.session-token',
          value: 'encoded-token',
        },
      ],
    })
    mockDecode.mockResolvedValue({
      sub: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      role: 'MEMBER',
      tier: 'FREE',
      exp: 1_900_000_000,
    })

    await expect(auth()).resolves.toEqual({
      expires: new Date(1_900_000_000 * 1000).toISOString(),
      user: {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        role: 'MEMBER',
        tier: 'FREE',
      },
    })

    expect(mockDecode).toHaveBeenCalledWith({
      token: 'encoded-token',
      secret: 'test-secret',
    })
  })
})
