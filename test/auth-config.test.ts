import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({
  default: vi.fn(() => vi.fn()),
}))

vi.mock('next-auth/jwt', () => ({
  decode: vi.fn(),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config) => ({ id: 'credentials', ...config })),
}))

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn((config) => ({ id: 'google', ...config })),
}))

vi.mock('next-auth/providers/github', () => ({
  default: vi.fn((config) => ({ id: 'github', ...config })),
}))

vi.mock('@next-auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({ name: 'prisma-adapter' })),
}))

vi.mock('bcryptjs', () => ({
  default: {},
  hash: vi.fn(),
  compare: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {},
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAndConsume: vi.fn(),
}))

vi.mock('@/lib/startup-validation', () => ({
  validateStartupEnvironment: vi.fn(),
}))

const originalNodeEnv = process.env.NODE_ENV
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

describe('auth config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    setEnvVar('NODE_ENV', originalNodeEnv)
    setEnvVar('NEXTAUTH_SECRET', originalNextAuthSecret)
    setEnvVar('AUTH_SECRET', originalAuthSecret)
  })

  it('uses shorter session lifetimes in production with secure cookie settings', async () => {
    setEnvVar('NODE_ENV', 'production')
    setEnvVar('NEXTAUTH_SECRET', 'prod-secret')
    setEnvVar('AUTH_SECRET', undefined)

    const { authOptions } = await import('@/lib/auth')

    expect(authOptions.session).toMatchObject({
      strategy: 'jwt',
      maxAge: 7 * 24 * 60 * 60,
      updateAge: 4 * 60 * 60,
    })
    expect(authOptions.jwt).toMatchObject({
      maxAge: 7 * 24 * 60 * 60,
    })
    expect(authOptions.useSecureCookies).toBe(true)
    expect(authOptions.cookies?.sessionToken).toMatchObject({
      name: '__Secure-next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    })
  })
})
