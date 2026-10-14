import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockReadApiObject = vi.fn()
const mockCheckAndConsume = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockBcryptCompare = vi.fn()
const mockBcryptHash = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/api-input', () => ({
  readApiObject: (...args: unknown[]) => mockReadApiObject(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAndConsume: (...args: unknown[]) => mockCheckAndConsume(...args),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
    hash: (...args: unknown[]) => mockBcryptHash(...args),
  },
}))

import { POST } from '@/app/api/account/change-password/route'

const request = () => new Request('https://example.com/api/account/change-password', { method: 'POST' })

describe('/api/account/change-password route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockCheckAndConsume.mockResolvedValue({ allowed: true })
    mockReadApiObject.mockResolvedValue({ currentPassword: 'old-password-1', newPassword: 'new-password-2' })
    mockFindUnique.mockResolvedValue({ password: 'hashed-old' })
    mockBcryptCompare.mockResolvedValue(true)
    mockBcryptHash.mockResolvedValue('hashed-new')
    mockUpdate.mockResolvedValue({ id: 'user-1' })
  })

  it('forwards the auth response when unauthenticated', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
    const response = await POST(request())
    expect(response.status).toBe(401)
  })

  it('rejects when rate limited', async () => {
    mockCheckAndConsume.mockResolvedValue({ allowed: false })
    const response = await POST(request())
    expect(response.status).toBe(429)
  })

  it('returns a JSON 503 when the rate limiter store fails', async () => {
    mockCheckAndConsume.mockRejectedValue(new Error('storage unavailable'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Request protection is temporarily unavailable. Try again shortly.',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a short new password', async () => {
    mockReadApiObject.mockResolvedValue({ currentPassword: 'old-password-1', newPassword: 'short' })
    const response = await POST(request())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Provide your current password and a new password of 8–72 characters.',
    })
  })

  it('rejects a new password longer than 72 characters', async () => {
    mockReadApiObject.mockResolvedValue({ currentPassword: 'old-password-1', newPassword: 'a'.repeat(73) })
    const response = await POST(request())
    expect(response.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a new password longer than 72 bytes', async () => {
    // 20 emoji = 20 chars but 80 bytes; bcrypt would silently truncate it.
    mockReadApiObject.mockResolvedValue({ currentPassword: 'old-password-1', newPassword: '🔐'.repeat(20) })
    const response = await POST(request())
    expect(response.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects when the new password matches the current password', async () => {
    mockReadApiObject.mockResolvedValue({ currentPassword: 'same-password', newPassword: 'same-password' })
    const response = await POST(request())
    expect(response.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects when the account has no password sign-in', async () => {
    mockFindUnique.mockResolvedValue({ password: null })
    const response = await POST(request())
    expect(response.status).toBe(400)
  })

  it('rejects a wrong current password without updating', async () => {
    mockBcryptCompare.mockResolvedValue(false)
    const response = await POST(request())
    expect(response.status).toBe(401)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('hashes the new password, updates the account, and bumps the password version', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mockBcryptCompare).toHaveBeenCalledWith('old-password-1', 'hashed-old')
    expect(mockBcryptHash).toHaveBeenCalledWith('new-password-2', 10)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { password: 'hashed-new', passwordVersion: { increment: 1 } },
    })
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
