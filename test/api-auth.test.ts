import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockAuth = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

import { getAuthenticatedAdmin, getAuthenticatedUser } from '@/lib/api-auth'

describe('API authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the authenticated user from a valid session', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
    })

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
})
