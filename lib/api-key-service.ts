import prisma from './prisma'
import { deriveKey, aesGcmEncrypt, aesGcmDecrypt } from './crypto'

type FallbackRecord = {
  id: string
  provider: string
  apiKey: string | null
  settings: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const fallbackStore = new Map<string, Map<string, FallbackRecord>>()

const getFallbackUserStore = (userId: string) => {
  let store = fallbackStore.get(userId)
  if (!store) {
    store = new Map<string, FallbackRecord>()
    fallbackStore.set(userId, store)
  }
  return store
}

const toProviderConfig = (record: FallbackRecord): ProviderConfig => ({
  id: record.id,
  provider: record.provider,
  isActive: record.isActive,
  settings: record.settings ? JSON.parse(record.settings) : undefined,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})

// Server-side encryption key from environment
const getEncryptionKey = async (): Promise<Uint8Array> => {
  const seed = process.env.API_KEY_ENCRYPTION_SEED || 'default-encryption-seed-change-in-production'
  return await deriveKey(seed)
}

export interface ProviderConfig {
  id: string
  provider: string
  isActive: boolean
  settings?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

/**
 * Store an encrypted API key for a user and provider
 */
export async function storeUserApiKey(
  userId: string,
  provider: string,
  apiKey: string,
  settings?: Record<string, any>
): Promise<ProviderConfig> {
  const encryptionKey = await getEncryptionKey()
  const encryptedApiKey = await aesGcmEncrypt(encryptionKey, apiKey)

  try {
    const config = await prisma.providerConfig.upsert({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      update: {
        apiKey: encryptedApiKey,
        settings: settings ? JSON.stringify(settings) : null,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        provider,
        apiKey: encryptedApiKey,
        settings: settings ? JSON.stringify(settings) : null,
        isActive: true,
      },
    })

    return {
      id: config.id,
      provider: config.provider,
      isActive: config.isActive,
      settings: config.settings ? JSON.parse(config.settings) : undefined,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }
  } catch (error) {
    console.warn('Falling back to in-memory provider config store:', error)
    const store = getFallbackUserStore(userId)
    const now = new Date()
    const existing = store.get(provider)
    const record: FallbackRecord = {
      id: existing?.id ?? `mem-${userId}-${provider}`,
      provider,
      apiKey: encryptedApiKey,
      settings: settings ? JSON.stringify(settings) : null,
      isActive: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    store.set(provider, record)
    return toProviderConfig(record)
  }
}

/**
 * Retrieve and decrypt an API key for a user and provider
 */
export async function getUserApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  let config: { apiKey: string | null; isActive: boolean } | null = null
  try {
    config = await prisma.providerConfig.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    })
  } catch (error) {
    console.warn('Falling back to in-memory provider config store:', error)
    const record = getFallbackUserStore(userId).get(provider)
    config = record
      ? { apiKey: record.apiKey, isActive: record.isActive }
      : null
  }

  if (!config || !config.apiKey || !config.isActive) {
    return null
  }

  try {
    const encryptionKey = await getEncryptionKey()
    return await aesGcmDecrypt(encryptionKey, config.apiKey)
  } catch (error) {
    console.error(`Failed to decrypt API key for ${provider}:`, error)
    return null
  }
}

/**
 * Get all provider configurations for a user (without API keys)
 */
export async function getUserProviderConfigs(userId: string): Promise<ProviderConfig[]> {
  try {
    const configs = await prisma.providerConfig.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        isActive: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return configs.map(config => ({
      id: config.id,
      provider: config.provider,
      isActive: config.isActive,
      settings: config.settings ? JSON.parse(config.settings) : undefined,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }))
  } catch (error) {
    console.warn('Falling back to in-memory provider config store:', error)
    const store = getFallbackUserStore(userId)
    return Array.from(store.values())
      .filter(config => config.isActive)
      .map(toProviderConfig)
  }
}

/**
 * Delete a provider configuration
 */
export async function deleteUserProviderConfig(
  userId: string,
  provider: string
): Promise<void> {
  try {
    await prisma.providerConfig.updateMany({
      where: {
        userId,
        provider,
      },
      data: {
        isActive: false,
        apiKey: null,
        updatedAt: new Date(),
      },
    })
  } catch (error) {
    console.warn('Falling back to in-memory provider config store:', error)
    const store = getFallbackUserStore(userId)
    const existing = store.get(provider)
    if (existing) {
      store.set(provider, {
        ...existing,
        isActive: false,
        apiKey: null,
        updatedAt: new Date(),
      })
    }
  }
}

/**
 * Check if user has a valid API key for a provider
 */
export async function hasValidApiKey(
  userId: string,
  provider: string
): Promise<boolean> {
  let config: { apiKey: string | null; isActive: boolean } | null = null
  try {
    config = await prisma.providerConfig.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    })
  } catch (error) {
    console.warn('Falling back to in-memory provider config store:', error)
    const record = getFallbackUserStore(userId).get(provider)
    config = record
      ? { apiKey: record.apiKey, isActive: record.isActive }
      : null
  }

  return !!(config && config.apiKey && config.isActive)
}

/**
 * Update provider settings without changing the API key
 */
export async function updateProviderSettings(
  userId: string,
  provider: string,
  settings: Record<string, any>
): Promise<ProviderConfig | null> {
  try {
    const config = await prisma.providerConfig.updateMany({
      where: {
        userId,
        provider,
        isActive: true,
      },
      data: {
        settings: JSON.stringify(settings),
        updatedAt: new Date(),
      },
    })

    if (config.count === 0) {
      return null
    }

    const updated = await prisma.providerConfig.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    })

    if (!updated) return null

    return {
      id: updated.id,
      provider: updated.provider,
      isActive: updated.isActive,
      settings: updated.settings ? JSON.parse(updated.settings) : undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }
  } catch (error) {
    console.warn('Falling back to in-memory provider config store:', error)
    const store = getFallbackUserStore(userId)
    const existing = store.get(provider)
    if (!existing || !existing.isActive) return null
    const updated: FallbackRecord = {
      ...existing,
      settings: JSON.stringify(settings),
      updatedAt: new Date(),
    }
    store.set(provider, updated)
    return toProviderConfig(updated)
  }
}
