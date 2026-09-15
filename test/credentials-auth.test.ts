import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindUnique = vi.fn()
const mockCompare = vi.fn()
const mockCheckAndConsume = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: (...args: unknown[]) => mockCompare(...args),
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAndConsume: (...args: unknown[]) => mockCheckAndConsume(...args),
}))

import { authorizeCredentials } from '@/lib/credentials-auth'

describe('authorizeCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckAndConsume.mockResolvedValue({ allowed: true })
  })

  it('returns an existing user when the password hash matches', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      password: 'stored-hash',
    })
    mockCompare.mockResolvedValue(true)

    await expect(
      authorizeCredentials({
        email: ' Test@Example.com ',
        password: 'correct-password',
      }),
    ).resolves.toEqual({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    })

    expect(mockCheckAndConsume).toHaveBeenCalledWith(
      'auth:login:test@example.com',
      { windowMs: 15 * 60 * 1000, max: 10 },
    )
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    })
    expect(mockCompare).toHaveBeenCalledWith(
      'correct-password',
      'stored-hash',
    )
  })

  it('does not create an account for an unknown email', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCompare.mockResolvedValue(false)

    await expect(
      authorizeCredentials({
        email: 'missing@example.com',
        password: 'any-password',
      }),
    ).resolves.toBeNull()

    expect(mockCompare).toHaveBeenCalledWith(
      'any-password',
      expect.stringMatching(/^\$2[aby]\$/),
    )
  })

  it('returns null for an incorrect password', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      password: 'stored-hash',
    })
    mockCompare.mockResolvedValue(false)

    await expect(
      authorizeCredentials({
        email: 'test@example.com',
        password: 'wrong-password',
      }),
    ).resolves.toBeNull()
  })

  it('rejects malformed credentials before touching the store', async () => {
    await expect(
      authorizeCredentials({ email: 'invalid-email', password: '' }),
    ).resolves.toBeNull()

    expect(mockCheckAndConsume).not.toHaveBeenCalled()
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockCompare).not.toHaveBeenCalled()
  })

  it('rejects attempts over the login rate limit', async () => {
    mockCheckAndConsume.mockResolvedValue({ allowed: false })

    await expect(
      authorizeCredentials({
        email: 'test@example.com',
        password: 'password',
      }),
    ).resolves.toBeNull()

    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockCompare).not.toHaveBeenCalled()
  })

  it('fails closed when the account store is unavailable', async () => {
    mockFindUnique.mockRejectedValue(new Error('database unavailable'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      authorizeCredentials({
        email: 'test@example.com',
        password: 'password',
      }),
    ).resolves.toBeNull()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
