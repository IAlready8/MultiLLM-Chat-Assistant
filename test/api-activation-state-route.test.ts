import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockGetUserProviderConfigs = vi.fn()
const mockPersonaService = {
  getPersonasByUserId: vi.fn(),
}
const mockConversationService = {
  getConversationsByUserId: vi.fn(),
}

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/lib/api-key-service', () => ({
  getUserProviderConfigs: (userId: string) => mockGetUserProviderConfigs(userId),
}))

vi.mock('@/services/persona-service.db', () => ({
  PersonaService: {
    getPersonasByUserId: (...args: unknown[]) =>
      mockPersonaService.getPersonasByUserId(...args),
  },
}))

vi.mock('@/services/conversation-service.db', () => ({
  ConversationService: {
    getConversationsByUserId: (...args: unknown[]) =>
      mockConversationService.getConversationsByUserId(...args),
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
    mockGetUserProviderConfigs.mockResolvedValue([{ provider: 'openai' }, { provider: 'anthropic' }])
    mockPersonaService.getPersonasByUserId.mockResolvedValue([{ id: 'persona-1' }])
    mockConversationService.getConversationsByUserId.mockResolvedValue([
      { id: 'conv-1' },
      { id: 'conv-2' },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configuredProviders: 2,
      personas: 1,
      conversations: 2,
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockGetAuthenticatedUser).toHaveBeenCalledWith({ allowGuest: true })
  })

  it('returns 500 when activation state lookup fails', async () => {
    mockGetUserProviderConfigs.mockRejectedValue(new Error('db unavailable'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load activation state',
    })

    consoleSpy.mockRestore()
  })
})
