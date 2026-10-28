import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockAuth = vi.fn()
const mockFindUser = vi.fn()

vi.mock('@/lib/auth', () => ({
  authIdentity: () => mockAuth(),
}))
vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique: (args: unknown) => mockFindUser(args) } },
}))

import { getAuthenticatedAdmin, getAuthenticatedUser } from '@/lib/api-auth'

type RoleResult = { user: { role: string } }

describe('API authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AUTH_OWNER_EMAILS', '')
    vi.stubEnv('AUTH_ADMIN_EMAILS', '')
    mockFindUser.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id, name: 'Current User', email: 'test@example.com', image: null,
    }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('returns the authenticated user from a valid session', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
    })

    const result = await getAuthenticatedUser()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string } }).user.id).toBe('user-123')
  })

  it('returns 401 when the session predates a password change', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123', pv: 0 } })
    mockFindUser.mockResolvedValue({ id: 'user-123', passwordVersion: 1 })

    const result = await getAuthenticatedUser()

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
    await expect((result as NextResponse).json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('accepts a session whose password version matches the account', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123', pv: 2 } })
    mockFindUser.mockResolvedValue({ id: 'user-123', passwordVersion: 2 })

    const result = await getAuthenticatedUser()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { id: string } }).user.id).toBe('user-123')
  })

  it('returns 401 when no authenticated session exists', async () => {
    mockAuth.mockResolvedValue(null)

    const result = await getAuthenticatedUser()

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
    await expect((result as NextResponse).json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 401 when a session token cannot be decrypted', async () => {
    mockAuth.mockRejectedValue(new Error('Invalid compact JWE'))
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await getAuthenticatedUser()

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
    await expect((result as NextResponse).json()).resolves.toEqual({
      error: 'Session expired',
    })
    consoleSpy.mockRestore()
  })

  it('returns 503 when the authentication service fails', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'reset-log-state' } })
    await getAuthenticatedUser()
    mockAuth.mockRejectedValue(new Error('Database connection refused'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getAuthenticatedUser()

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(503)
    await expect((result as NextResponse).json()).resolves.toEqual({
      error: 'Auth unavailable',
    })
    consoleSpy.mockRestore()
  })

  it.each(['OWNER', 'ADMIN'])('allows the %s role to use admin routes', async (role) => {
    vi.stubEnv(`AUTH_${role}_EMAILS`, 'test@example.com')
    mockAuth.mockResolvedValue({
      user: {
        id: 'admin-123',
        name: 'Admin User',
        email: 'admin@example.com',
        role,
      },
    })

    const result = await getAuthenticatedAdmin()

    expect(result).not.toBeInstanceOf(NextResponse)
    expect((result as { user: { role: string } }).user.role).toBe(role)
  })

  it('rejects a still-valid token after its account was deleted', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'deleted-user' } })
    mockFindUser.mockResolvedValue(null)
    expect((await getAuthenticatedUser() as NextResponse).status).toBe(401)
  })

  it('does not trust the admin role or email in an old token', async () => {
    vi.stubEnv('AUTH_ADMIN_EMAILS', 'old-admin@example.com')
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', email: 'old-admin@example.com', role: 'ADMIN' },
    })
    expect((await getAuthenticatedAdmin() as NextResponse).status).toBe(403)
  })

  it('fails closed when current account validation is unavailable', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } })
    mockFindUser.mockRejectedValue(new Error('database unavailable'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await getAuthenticatedUser() as NextResponse).status).toBe(503)
    spy.mockRestore()
  })

  it('returns 403 for an authenticated non-admin user', async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: 'member-123',
        name: 'Member User',
        email: 'member@example.com',
        role: 'MEMBER',
      },
    })

    const result = await getAuthenticatedAdmin()

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  describe('persisted role reconciled with password-version revocation', () => {
    it('reads both the persisted role and the password version in one account query', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123', pv: 0 } })

      await getAuthenticatedUser()

      expect(mockFindUser).toHaveBeenCalledTimes(1)
      expect(mockFindUser).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          passwordVersion: true,
          role: true,
        },
      })
    })

    it.each(['ADMIN', 'OWNER'])(
      'grants admin routes to a persisted %s who is not allowlisted',
      async (role) => {
        mockAuth.mockResolvedValue({ user: { id: 'db-elevated', pv: 4 } })
        mockFindUser.mockResolvedValue({
          id: 'db-elevated',
          email: 'db-elevated@example.com',
          passwordVersion: 4,
          role,
        })

        const result = await getAuthenticatedAdmin()

        expect(result).not.toBeInstanceOf(NextResponse)
        expect((result as RoleResult).user.role).toBe(role)
      },
    )

    it.each(['ADMIN', 'OWNER'])(
      'revokes a persisted %s session minted before a password change',
      async (role) => {
        mockAuth.mockResolvedValue({ user: { id: 'db-elevated', pv: 2 } })
        mockFindUser.mockResolvedValue({
          id: 'db-elevated',
          email: 'db-elevated@example.com',
          passwordVersion: 3,
          role,
        })

        const result = await getAuthenticatedAdmin()

        expect(result).toBeInstanceOf(NextResponse)
        expect((result as NextResponse).status).toBe(401)
        await expect((result as NextResponse).json()).resolves.toEqual({
          error: 'Unauthorized',
        })
      },
    )

    it('revokes an allowlisted owner session minted before a password change', async () => {
      vi.stubEnv('AUTH_OWNER_EMAILS', 'owner@example.com')
      mockAuth.mockResolvedValue({ user: { id: 'owner-1', pv: 0 } })
      mockFindUser.mockResolvedValue({
        id: 'owner-1',
        email: 'owner@example.com',
        passwordVersion: 1,
        role: 'OWNER',
      })

      expect((await getAuthenticatedAdmin() as NextResponse).status).toBe(401)
    })

    it('does not let a persisted MEMBER demote an allowlisted owner (P2 floor)', async () => {
      vi.stubEnv('AUTH_OWNER_EMAILS', 'owner@example.com')
      mockAuth.mockResolvedValue({ user: { id: 'owner-1', pv: 0 } })
      mockFindUser.mockResolvedValue({
        id: 'owner-1',
        email: 'owner@example.com',
        passwordVersion: 0,
        role: 'MEMBER',
      })

      const result = await getAuthenticatedAdmin()

      expect(result).not.toBeInstanceOf(NextResponse)
      expect((result as RoleResult).user.role).toBe('OWNER')
    })

    it.each(['USER', 'SUPERUSER', 'admin-ish', '', ' admin ', 'admin', 'Owner', 'ADMIN '])(
      'ignores the non-exact persisted role %j and denies admin routes (P1)',
      async (role) => {
        mockAuth.mockResolvedValue({ user: { id: 'odd-1', pv: 0 } })
        mockFindUser.mockResolvedValue({
          id: 'odd-1',
          email: 'odd@example.com',
          passwordVersion: 0,
          role,
        })

        const result = await getAuthenticatedAdmin()

        expect(result).toBeInstanceOf(NextResponse)
        expect((result as NextResponse).status).toBe(403)
      },
    )

    it('ignores an elevated role claim in the token when the account is a MEMBER (P3)', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'member-9', pv: 0, role: 'OWNER', email: 'member9@example.com' },
      })
      mockFindUser.mockResolvedValue({
        id: 'member-9',
        email: 'member9@example.com',
        passwordVersion: 0,
        role: 'MEMBER',
      })

      expect((await getAuthenticatedAdmin() as NextResponse).status).toBe(403)
    })

    it('ignores a MEMBER role claim in the token when the account is a persisted ADMIN (P3)', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'db-admin', pv: 0, role: 'MEMBER', email: 'db-admin@example.com' },
      })
      mockFindUser.mockResolvedValue({
        id: 'db-admin',
        email: 'db-admin@example.com',
        passwordVersion: 0,
        role: 'ADMIN',
      })

      const result = await getAuthenticatedAdmin()

      expect(result).not.toBeInstanceOf(NextResponse)
      expect((result as RoleResult).user.role).toBe('ADMIN')
    })

    it('treats a missing persisted role as MEMBER for non-allowlisted accounts', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'legacy-1', pv: 0 } })
      mockFindUser.mockResolvedValue({
        id: 'legacy-1',
        email: 'legacy@example.com',
        passwordVersion: 0,
        role: null,
      })

      const userResult = await getAuthenticatedUser()
      expect(userResult).not.toBeInstanceOf(NextResponse)
      expect((userResult as unknown as RoleResult).user.role).toBe('MEMBER')

      const adminResult = await getAuthenticatedAdmin()
      expect(adminResult).toBeInstanceOf(NextResponse)
      expect((adminResult as NextResponse).status).toBe(403)
    })

    // P2 preservation: right after the migration every row holds the column
    // default MEMBER, so the admin decision must match main's allowlist-only
    // behavior for every allowlist placement.
    it.each([
      { owner: 'a@example.com', admin: '', expected: 200 },
      { owner: '', admin: 'a@example.com', expected: 200 },
      { owner: 'a@example.com', admin: 'a@example.com', expected: 200 },
      { owner: 'other@example.com', admin: 'other2@example.com', expected: 403 },
      { owner: '', admin: '', expected: 403 },
    ])(
      'with a default MEMBER row, owner=$owner admin=$admin gives $expected like main',
      async ({ owner, admin, expected }) => {
        vi.stubEnv('AUTH_OWNER_EMAILS', owner)
        vi.stubEnv('AUTH_ADMIN_EMAILS', admin)
        mockAuth.mockResolvedValue({ user: { id: 'u-a', pv: 0 } })
        mockFindUser.mockResolvedValue({
          id: 'u-a',
          email: 'a@example.com',
          passwordVersion: 0,
          role: 'MEMBER',
        })

        const result = await getAuthenticatedAdmin()
        const status = result instanceof NextResponse ? result.status : 200

        expect(status).toBe(expected)
      },
    )
  })
})
