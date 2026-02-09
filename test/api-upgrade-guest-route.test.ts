import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()
const mockMigrateGuestData = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/lib/guest-migration', () => ({
  migrateGuestData: (guestUserId: string, userId: string) =>
    mockMigrateGuestData(guestUserId, userId),
}))

import { POST } from '@/app/api/auth/upgrade-guest/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/upgrade-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/auth/upgrade-guest route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when session is missing', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await POST(makeRequest({ guestUserId: 'guest-local-user' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mockMigrateGuestData).not.toHaveBeenCalled()
  })

  it('returns 400 when target user is still a guest/demo account', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'guest-local-user' } })

    const response = await POST(makeRequest({ guestUserId: 'guest-local-user' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Cannot migrate guest data to a guest account',
    })
    expect(mockMigrateGuestData).not.toHaveBeenCalled()
  })

  it('uses provided guestUserId and returns migration counts', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } })
    mockMigrateGuestData.mockResolvedValue({
      goals: 2,
      providerConfigs: 1,
      conversations: 3,
      personas: 4,
    })

    const response = await POST(makeRequest({ guestUserId: 'guest-temp' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      migrated: true,
      counts: {
        goals: 2,
        providerConfigs: 1,
        conversations: 3,
        personas: 4,
      },
    })

    expect(mockMigrateGuestData).toHaveBeenCalledWith('guest-temp', 'user-123')
  })

  it('falls back to guest-local-user when guestUserId is missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } })
    mockMigrateGuestData.mockResolvedValue({
      goals: 0,
      providerConfigs: 0,
      conversations: 0,
      personas: 0,
    })

    const response = await POST(makeRequest({}))

    expect(response.status).toBe(200)
    expect(mockMigrateGuestData).toHaveBeenCalledWith('guest-local-user', 'user-123')
  })

  it('returns 500 when migration throws', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } })
    mockMigrateGuestData.mockRejectedValue(new Error('boom'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(makeRequest({ guestUserId: 'guest-local-user' }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Migration failed' })

    consoleSpy.mockRestore()
  })
})
