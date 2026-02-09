import prisma from '@/lib/prisma'
import { deriveKey, aesGcmDecrypt, aesGcmEncrypt } from '@/lib/crypto'

/**
 * Migrates in-memory fallback data from a guest user to an authenticated user's
 * database records. Handles goals, provider configs, conversations, and personas.
 *
 * This is called after a guest signs up — their session-scoped data is moved
 * into permanent storage under their real user ID.
 */

type MigrationCounts = {
  goals: number
  providerConfigs: number
  conversations: number
  personas: number
}

// Access the globalThis fallback stores used by each service
type GoalRecord = {
  id: string
  title: string
  description?: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

type ProviderRecord = {
  id: string
  provider: string
  apiKey: string | null
  settings: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type MessageRecord = {
  id: string
  role: string
  content: string
  provider?: string | null
  model?: string | null
  createdAt: Date
}

type ConversationRecord = {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  messages: MessageRecord[]
}

type PersonaRecord = {
  id: string
  title: string
  description?: string | null
  prompt: string
  createdAt: Date
  updatedAt: Date
}

function getGoalStore(): Map<string, Map<string, GoalRecord>> | undefined {
  return (globalThis as Record<string, unknown>)
    .__multiLlmGoalFallbackStore as
    | Map<string, Map<string, GoalRecord>>
    | undefined
}

function getProviderStore(): Map<string, Map<string, ProviderRecord>> | undefined {
  return (globalThis as Record<string, unknown>)
    .__multiLlmProviderFallbackStore as
    | Map<string, Map<string, ProviderRecord>>
    | undefined
}

function getConversationStore(): Map<string, Map<string, ConversationRecord>> | undefined {
  return (globalThis as Record<string, unknown>)
    .__multiLlmConversationFallbackStore as
    | Map<string, Map<string, ConversationRecord>>
    | undefined
}

function getPersonaStore(): Map<string, Map<string, PersonaRecord>> | undefined {
  return (globalThis as Record<string, unknown>)
    .__multiLlmPersonaFallbackStore as
    | Map<string, Map<string, PersonaRecord>>
    | undefined
}

async function reEncryptApiKey(
  encryptedKey: string | null
): Promise<string | null> {
  if (!encryptedKey) return null
  // The key is already encrypted with the same seed — just pass it through.
  // Re-encryption would only be needed if the seed changed between guest and user mode,
  // which doesn't happen since it's a server-side constant.
  return encryptedKey
}

export async function migrateGuestData(
  guestUserId: string,
  targetUserId: string
): Promise<MigrationCounts> {
  const counts: MigrationCounts = {
    goals: 0,
    providerConfigs: 0,
    conversations: 0,
    personas: 0,
  }

  // 1. Migrate goals
  const goalStore = getGoalStore()
  const guestGoals = goalStore?.get(guestUserId)
  if (guestGoals && guestGoals.size > 0) {
    for (const goal of guestGoals.values()) {
      try {
        await prisma.goal.create({
          data: {
            title: goal.title,
            description: goal.description ?? null,
            status: goal.status,
            userId: targetUserId,
          },
        })
        counts.goals++
      } catch (error) {
        console.warn('Failed to migrate goal:', goal.id, error)
      }
    }
    guestGoals.clear()
  }

  // 2. Migrate provider configs (encrypted API keys)
  const providerStore = getProviderStore()
  const guestProviders = providerStore?.get(guestUserId)
  if (guestProviders && guestProviders.size > 0) {
    for (const config of guestProviders.values()) {
      if (!config.isActive) continue
      try {
        const apiKey = await reEncryptApiKey(config.apiKey)
        await prisma.providerConfig.upsert({
          where: {
            userId_provider: {
              userId: targetUserId,
              provider: config.provider,
            },
          },
          update: {
            apiKey,
            settings: config.settings,
            isActive: true,
            updatedAt: new Date(),
          },
          create: {
            userId: targetUserId,
            provider: config.provider,
            apiKey,
            settings: config.settings,
            isActive: true,
          },
        })
        counts.providerConfigs++
      } catch (error) {
        console.warn('Failed to migrate provider config:', config.provider, error)
      }
    }
    guestProviders.clear()
  }

  // 3. Migrate conversations with messages
  const conversationStore = getConversationStore()
  const guestConversations = conversationStore?.get(guestUserId)
  if (guestConversations && guestConversations.size > 0) {
    for (const conversation of guestConversations.values()) {
      try {
        await prisma.conversation.create({
          data: {
            title: conversation.title,
            userId: targetUserId,
            messages: {
              create: conversation.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
                provider: msg.provider ?? null,
                model: msg.model ?? null,
              })),
            },
          },
        })
        counts.conversations++
      } catch (error) {
        console.warn('Failed to migrate conversation:', conversation.id, error)
      }
    }
    guestConversations.clear()
  }

  // 4. Migrate personas
  const personaStore = getPersonaStore()
  const guestPersonas = personaStore?.get(guestUserId)
  if (guestPersonas && guestPersonas.size > 0) {
    for (const persona of guestPersonas.values()) {
      try {
        await prisma.persona.create({
          data: {
            title: persona.title,
            description: persona.description ?? null,
            prompt: persona.prompt,
            userId: targetUserId,
          },
        })
        counts.personas++
      } catch (error) {
        console.warn('Failed to migrate persona:', persona.id, error)
      }
    }
    guestPersonas.clear()
  }

  return counts
}
