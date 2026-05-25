import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const originalNextAuthSecret = process.env.NEXTAUTH_SECRET
process.env.NEXTAUTH_SECRET = 'test-secret'

const mockCookies = vi.fn()
const mockDecode = vi.fn()
const mockPrismaUserFindUnique = vi.hoisted(() => vi.fn())
const mockPrismaSubscriptionFindUnique = vi.hoisted(() => vi.fn())

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
      findUnique: mockPrismaUserFindUnique,
      create: vi.fn(),
    },
    subscription: {
      findUnique: mockPrismaSubscriptionFindUnique,
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

const { auth, authOptions, readSessionTokenFromCookieStore } = await import('@/lib/auth')

afterAll(() => {
  process.env.NEXTAUTH_SECRET = originalNextAuthSecret
})

describe('auth session token reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrismaUserFindUnique.mockReset()
    mockPrismaSubscriptionFindUnique.mockReset()
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
      role: 'USER',
      tier: 'FREE',
      exp: 1_900_000_000,
    })

    await expect(auth()).resolves.toEqual({
      expires: new Date(1_900_000_000 * 1000).toISOString(),
      user: {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
        role: 'USER',
        tier: 'FREE',
      },
    })

    expect(mockDecode).toHaveBeenCalledWith({
      token: 'encoded-token',
      secret: 'test-secret',
    })
  })

  it('loads the persisted user role into JWT and session callbacks', async () => {
    mockPrismaUserFindUnique.mockResolvedValue({
      role: 'ADMIN',
    })
    mockPrismaSubscriptionFindUnique.mockResolvedValue({ tier: 'PRO' })

    const jwt = authOptions.callbacks?.jwt
    const session = authOptions.callbacks?.session
    expect(jwt).toBeDefined()
    expect(session).toBeDefined()

    const token = await jwt!({
      token: {
        sub: 'user-123',
        email: 'admin@example.com',
        name: 'Admin User',
      },
      user: {
        id: 'user-123',
        email: 'admin@example.com',
        name: 'Admin User',
      },
      account: null,
      profile: undefined,
      trigger: 'signIn',
      isNewUser: false,
    } as never)

    expect(mockPrismaUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      select: {
        role: true,
      },
    })
    expect(mockPrismaSubscriptionFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-123' },
      select: { tier: true },
    })
    expect(token.role).toBe('ADMIN')
    expect(token.tier).toBe('PRO')

    const appSession = await session!({
      session: {
        expires: new Date(1_900_000_000 * 1000).toISOString(),
        user: {
          id: '',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'USER',
          tier: 'FREE',
        },
      },
      token,
      user: undefined,
      newSession: undefined,
      trigger: 'update',
    } as never)

    expect(appSession.user).toMatchObject({
      id: 'user-123',
      role: 'ADMIN',
      tier: 'PRO',
    })
  })

  it('defaults unknown or missing persisted roles to USER', async () => {
    mockPrismaUserFindUnique.mockResolvedValue({
      role: null,
    })
    mockPrismaSubscriptionFindUnique.mockResolvedValue(null)

    const jwt = authOptions.callbacks?.jwt
    expect(jwt).toBeDefined()

    const token = await jwt!({
      token: {
        sub: 'user-123',
        role: 'MEMBER',
      },
      user: undefined,
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
    } as never)

    expect(token.role).toBe('USER')
    expect(token.tier).toBe('FREE')
  })
})
