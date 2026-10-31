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

const mockProviderConfigUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: { providerConfig: { update: (args: unknown) => mockProviderConfigUpdate(args) } },
}))

import { GET, PUT } from '@/app/api/jev/config/route'

const putRequest = (body: unknown) =>
  new Request('http://localhost/api/jev/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

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

describe('/api/jev/config PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockGetUserProviderConfigs.mockResolvedValue([])
    mockStoreUserApiKey.mockResolvedValue(undefined)
    mockProviderConfigUpdate.mockResolvedValue(undefined)
  })

  it('forwards the auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    )

    const response = await PUT(putRequest({ enabled: true, token: 'k' }))

    expect(response.status).toBe(401)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('rejects a body larger than the 4 KB limit with 413 before storing anything', async () => {
    const response = await PUT(putRequest({ enabled: true, token: 'k', padding: 'x'.repeat(5000) }))

    expect(response.status).toBe(413)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON with 400', async () => {
    const response = await PUT(putRequest('{not json'))

    expect(response.status).toBe(400)
  })

  it('rejects a body without a boolean enabled flag', async () => {
    const response = await PUT(putRequest({ enabled: 'yes' }))

    expect(response.status).toBe(400)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('rejects an over-long key', async () => {
    const response = await PUT(putRequest({ enabled: true, token: 'k'.repeat(201) }))

    expect(response.status).toBe(400)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })

  it('stores a new key with the enabled flag', async () => {
    const response = await PUT(putRequest({ enabled: true, token: 'new-key' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ configured: true, enabled: true })
    expect(mockStoreUserApiKey).toHaveBeenCalledWith('user-1', 'jev', 'new-key', { jevJudgingEnabled: true })
  })

  it('updates only the flag when a config exists and no key is sent', async () => {
    mockGetUserProviderConfigs.mockResolvedValue([jevConfig])

    const response = await PUT(putRequest({ enabled: false }))

    expect(response.status).toBe(200)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
    expect(mockProviderConfigUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_provider: { userId: 'user-1', provider: 'jev' } },
      data: expect.objectContaining({ settings: JSON.stringify({ jevJudgingEnabled: false }) }),
    }))
  })

  it('refuses to enable judging without any key', async () => {
    const response = await PUT(putRequest({ enabled: true }))

    expect(response.status).toBe(400)
    expect(mockStoreUserApiKey).not.toHaveBeenCalled()
  })
})
