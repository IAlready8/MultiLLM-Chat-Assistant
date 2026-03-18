import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserProviderConfigCount = vi.fn()
const mockPersonaService = {
  getPersonaCountByUserId: vi.fn(),
}
const mockConversationService = {
  getComparisonReadyConversationCountByUserId: vi.fn(),
}

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/lib/api-key-service', () => ({
  getUserProviderConfigCount: (userId: string) =>
    mockGetUserProviderConfigCount(userId),
}))

vi.mock('@/lib/demo-account', () => ({
  createGuestUserRecord: () => ({
    id: 'guest-local-user',
    email: 'guest@local.dev',
  }),
  getDemoAccountContext: () => ({
    id: 'demo-user',
    email: 'demo@local.dev',
  }),
}))

vi.mock('@/services/persona-service.db', () => ({
  PersonaService: {
    getPersonaCountByUserId: (...args: unknown[]) =>
      mockPersonaService.getPersonaCountByUserId(...args),
  },
}))

vi.mock('@/services/conversation-service.db', () => ({
  ConversationService: {
    getComparisonReadyConversationCountByUserId: (...args: unknown[]) =>
      mockConversationService.getComparisonReadyConversationCountByUserId(...args),
  },
}))

import { GET } from '@/app/api/activation-state/route'

describe('/api/activation-state route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns activation counts and disables caching', async () => {
    mockGetUserProviderConfigCount.mockResolvedValue(2)
    mockPersonaService.getPersonaCountByUserId.mockResolvedValue(1)
    mockConversationService.getComparisonReadyConversationCountByUserId.mockResolvedValue(2)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configuredProviders: 2,
      personas: 1,
      comparisonReadyConversations: 2,
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith({ allowGuest: true })
  })

  it('returns zero progress for shared guest users without hitting data stores', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      user: { id: 'guest-local-user', email: 'guest@local.dev' },
    })

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configuredProviders: 0,
      personas: 0,
      comparisonReadyConversations: 0,
    })
    expect(mockGetUserProviderConfigCount).not.toHaveBeenCalled()
    expect(mockPersonaService.getPersonaCountByUserId).not.toHaveBeenCalled()
    expect(
      mockConversationService.getComparisonReadyConversationCountByUserId
    ).not.toHaveBeenCalled()
  })

  it('returns 500 when activation state lookup fails', async () => {
    mockGetUserProviderConfigCount.mockRejectedValue(new Error('db unavailable'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load activation state',
    })

    consoleSpy.mockRestore()
  })
})
