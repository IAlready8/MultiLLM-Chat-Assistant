import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockHasValidApiKey = vi.fn()
const mockStoreUserApiKey = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: () => mockGetAuthenticatedUser(),
}))

vi.mock('@/lib/api-key-service', () => ({
  storeUserApiKey: (
    userId: string,
    provider: string,
    apiKey: string,
    settings: Record<string, unknown>,
  ) => mockStoreUserApiKey(userId, provider, apiKey, settings),
  getUserProviderConfigs: (userId: string) =>
    mockGetUserProviderConfigs(userId),
  hasValidApiKey: (userId: string, provider: string) =>
    mockHasValidApiKey(userId, provider),
}))

vi.mock('@/lib/prisma', () => ({
  default: { providerConfig: { update: vi.fn() } },
}))

import { GET } from '@/app/api/jev/config/route'

const jevConfig = {
  id: 'cfg-jev',
  provider: 'jev',
  isActive: true,
  settings: { jevJudgingEnabled: true },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('/api/jev/config GET', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('returns not configured when no Jev provider config exists', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: false,
      enabled: false,
    })
    expect(mockHasValidApiKey).not.toHaveBeenCalled()
  })

  it('reports configured and hasKey from the credential check, not a returned key field', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([jevConfig])
    mockHasValidApiKey.mockResolvedValue(true)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: true,
      enabled: true,
      hasKey: true,
    })
    expect(mockHasValidApiKey).toHaveBeenCalledWith('user-1', 'jev')
  })

  it('reports not configured when the stored credential is absent, even with a config record', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([jevConfig])
    mockHasValidApiKey.mockResolvedValue(false)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: false,
      enabled: true,
      hasKey: false,
    })
  })

  it('forwards the auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    )

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mockGetUserProviderConfigs).not.toHaveBeenCalled()
  })
})
