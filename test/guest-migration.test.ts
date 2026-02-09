import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing
vi.mock('@/lib/prisma', () => ({
  default: {
    goal: {
      create: vi.fn().mockResolvedValue({ id: 'goal-1' }),
    },
    providerConfig: {
      upsert: vi.fn().mockResolvedValue({ id: 'pc-1' }),
    },
    conversation: {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
    },
    persona: {
      create: vi.fn().mockResolvedValue({ id: 'persona-1' }),
    },
  },
}))

vi.mock('@/lib/crypto', () => ({
  deriveKey: vi.fn(),
  aesGcmEncrypt: vi.fn(),
  aesGcmDecrypt: vi.fn(),
}))

import { migrateGuestData } from '@/lib/guest-migration'

describe('guest-migration', () => {
  const GUEST_ID = 'guest-local-user'
  const TARGET_ID = 'real-user-123'

  beforeEach(() => {
    vi.clearAllMocks()
    // Clean up any global fallback stores
    delete (globalThis as Record<string, unknown>).__multiLlmGoalFallbackStore
    delete (globalThis as Record<string, unknown>).__multiLlmProviderFallbackStore
    delete (globalThis as Record<string, unknown>).__multiLlmConversationFallbackStore
    delete (globalThis as Record<string, unknown>).__multiLlmPersonaFallbackStore
  })

  it('returns zero counts when no guest data exists', async () => {
    const result = await migrateGuestData(GUEST_ID, TARGET_ID)
    expect(result).toEqual({
      goals: 0,
      providerConfigs: 0,
      conversations: 0,
      personas: 0,
    })
  })

  it('migrates goals from guest store to DB', async () => {
    const goalStore = new Map<string, Map<string, unknown>>()
    const userGoals = new Map<string, unknown>()
    userGoals.set('g1', {
      id: 'g1',
      title: 'Test Goal',
      description: 'A goal',
      status: 'in-progress',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    goalStore.set(GUEST_ID, userGoals)
    ;(globalThis as Record<string, unknown>).__multiLlmGoalFallbackStore = goalStore

    const result = await migrateGuestData(GUEST_ID, TARGET_ID)

    expect(result.goals).toBe(1)
    // Store should be cleared after migration
    expect(userGoals.size).toBe(0)
  })

  it('migrates provider configs from guest store to DB', async () => {
    const providerStore = new Map<string, Map<string, unknown>>()
    const userProviders = new Map<string, unknown>()
    userProviders.set('openai', {
      id: 'pc-1',
      provider: 'openai',
      apiKey: 'encrypted-key',
      settings: '{"models":["gpt-4"]}',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    providerStore.set(GUEST_ID, userProviders)
    ;(globalThis as Record<string, unknown>).__multiLlmProviderFallbackStore =
      providerStore

    const result = await migrateGuestData(GUEST_ID, TARGET_ID)

    expect(result.providerConfigs).toBe(1)
    expect(userProviders.size).toBe(0)
  })

  it('skips inactive provider configs', async () => {
    const providerStore = new Map<string, Map<string, unknown>>()
    const userProviders = new Map<string, unknown>()
    userProviders.set('openai', {
      id: 'pc-1',
      provider: 'openai',
      apiKey: null,
      settings: null,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    providerStore.set(GUEST_ID, userProviders)
    ;(globalThis as Record<string, unknown>).__multiLlmProviderFallbackStore =
      providerStore

    const result = await migrateGuestData(GUEST_ID, TARGET_ID)

    expect(result.providerConfigs).toBe(0)
  })

  it('migrates conversations with messages', async () => {
    const convStore = new Map<string, Map<string, unknown>>()
    const userConversations = new Map<string, unknown>()
    userConversations.set('c1', {
      id: 'c1',
      title: 'Test Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Hello',
          provider: null,
          model: null,
          createdAt: new Date(),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Hi there!',
          provider: 'openai',
          model: 'gpt-4',
          createdAt: new Date(),
        },
      ],
    })
    convStore.set(GUEST_ID, userConversations)
    ;(globalThis as Record<string, unknown>).__multiLlmConversationFallbackStore =
      convStore

    const result = await migrateGuestData(GUEST_ID, TARGET_ID)

    expect(result.conversations).toBe(1)
    expect(userConversations.size).toBe(0)
  })
})
