import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// Mock dependencies before importing the module under test
const mockAuth = vi.fn()
const mockCookies = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}))

vi.mock('@/lib/demo-account', () => ({
  getDemoAccountContext: () => ({
    enabled: false,
    bypassAuth: false,
    id: 'demo-user',
    name: 'Demo User',
    email: 'demo@local.dev',
    password: 'demo12345',
  }),
  isStrictAuthRequired: () => false,
  createDemoUserRecord: () => ({
    id: 'demo-user',
    name: 'Demo User',
    email: 'demo@local.dev',
    password: null,
    emailVerified: null,
    image: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }),
  createGuestUserRecord: () => ({
    id: 'guest-user',
    name: 'Guest',
    email: null,
    password: null,
    emailVerified: null,
    image: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }),
}))

// Import after mocks are set up
import { getAuthenticatedAdmin, getAuthenticatedUser } from '@/lib/api-auth'

describe('getAuthenticatedUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCookies.mockReturnValue({
      get: () => undefined,
    })
  })

  it('returns user when session is valid', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'token' } : undefined,
    })
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', name: 'Test User', email: 'test@test.com' },
    })

    const result = await getAuthenticatedUser()
    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string } }).user.id).toBe('user-123')
  })

  it('returns guest when allowGuest=true and no session cookie', async () => {
    const result = await getAuthenticatedUser({ allowGuest: true })
    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string } }).user.id).toBe('guest-user')
  })

  it('returns 401 when no session and allowGuest=false', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'token' } : undefined,
    })
    mockAuth.mockResolvedValue({ user: null })

    const result = await getAuthenticatedUser({ allowGuest: false })
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it('returns guest on JWT decryption error with allowGuest=true', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'bad-token' } : undefined,
    })
    mockAuth.mockRejectedValue(new Error('Invalid compact JWE'))

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await getAuthenticatedUser({ allowGuest: true })
    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string } }).user.id).toBe('guest-user')

    consoleSpy.mockRestore()
  })

  it('returns 401 on JWT decryption error without allowGuest', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'bad-token' } : undefined,
    })
    mockAuth.mockRejectedValue(new Error('jwt decryption failed'))

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await getAuthenticatedUser({ allowGuest: false })
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)

    consoleSpy.mockRestore()
  })

  it('returns 503 on non-JWT errors without allowGuest', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'token' } : undefined,
    })
    mockAuth.mockRejectedValue(new Error('Database connection refused'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getAuthenticatedUser({ allowGuest: false })
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(503)

    consoleSpy.mockRestore()
  })

  it('returns guest on non-JWT errors with allowGuest=true', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'token' } : undefined,
    })
    mockAuth.mockRejectedValue(new Error('Database connection refused'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getAuthenticatedUser({ allowGuest: true })
    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string } }).user.id).toBe('guest-user')

    consoleSpy.mockRestore()
  })

  it('returns authenticated admin users for OWNER/ADMIN roles', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'token' } : undefined,
    })
    mockAuth.mockResolvedValue({
      user: {
        id: 'owner-123',
        name: 'Owner User',
        email: 'owner@test.com',
        role: 'OWNER',
      },
    })

    const result = await getAuthenticatedAdmin()
    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string; role: string } }).user).toMatchObject({
      id: 'owner-123',
      role: 'OWNER',
    })
  })

  it('returns 403 for authenticated non-admin users', async () => {
    mockCookies.mockReturnValue({
      get: (name: string) =>
        name === 'next-auth.session-token' ? { value: 'token' } : undefined,
    })
    mockAuth.mockResolvedValue({
      user: {
        id: 'member-123',
        name: 'Member User',
        email: 'member@test.com',
        role: 'MEMBER',
      },
    })

    const result = await getAuthenticatedAdmin()
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })
})
