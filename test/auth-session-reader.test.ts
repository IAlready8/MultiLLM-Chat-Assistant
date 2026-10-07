import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
const originalOwnerEmails = process.env.AUTH_OWNER_EMAILS
process.env.NEXTAUTH_SECRET = 'test-secret'

const mockCookies = vi.fn()
const mockDecode = vi.fn()
const mockSubscriptionFindUnique = vi.fn()

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
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
    },
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAndConsume: vi.fn(async () => ({ allowed: true })),
}))

vi.mock('@/lib/credentials-auth', () => ({
  authorizeCredentials: vi.fn(),
}))

vi.mock('@/lib/startup-validation', () => ({
  validateStartupEnvironment: vi.fn(),
}))

const { auth, authOptions, readSessionTokenFromCookieStore } = await import(
  '@/lib/auth'
)

afterAll(() => {
  process.env.NEXTAUTH_SECRET = originalNextAuthSecret
  if (originalOwnerEmails === undefined) {
    delete process.env.AUTH_OWNER_EMAILS
  } else {
    process.env.AUTH_OWNER_EMAILS = originalOwnerEmails
  }
})

describe('auth session token reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscriptionFindUnique.mockResolvedValue(null)
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
      'secure-token-value',
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
      'first-second',
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

  it('refreshes the subscription tier from the database', async () => {
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
      role: 'MEMBER',
      tier: 'FREE',
      exp: 1_900_000_000,
    })
    mockSubscriptionFindUnique.mockResolvedValue({ tier: 'PRO' })

    const session = await auth()

    expect(session?.user.tier).toBe('PRO')
    expect(mockSubscriptionFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: { tier: true },
    })
  })

  it('re-evaluates operator roles from the server-only allowlist', async () => {
    const jwtCallback = authOptions.callbacks?.jwt
    expect(jwtCallback).toBeTypeOf('function')
    const runJwtCallback = jwtCallback as unknown as (input: {
      token: Record<string, unknown>
    }) => Promise<Record<string, unknown>>
    process.env.AUTH_OWNER_EMAILS = 'owner@example.com'

    const ownerToken = await runJwtCallback({
      token: { email: 'OWNER@example.com', tier: 'FREE' },
    })
    expect(ownerToken.role).toBe('OWNER')

    delete process.env.AUTH_OWNER_EMAILS
    const downgradedToken = await runJwtCallback({
      token: ownerToken,
    })
    expect(downgradedToken.role).toBe('MEMBER')
  })
})
