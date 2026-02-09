import prisma from './prisma'
import { deriveKey, aesGcmEncrypt, aesGcmDecrypt } from './crypto'
import { createDbAvailabilityTracker, getOrCreateUserStore } from './db-fallback'

type FallbackRecord = {
  id: string
  provider: string
  apiKey: string | null
  settings: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type GlobalApiKeyFallback = typeof globalThis & {
  __multiLlmProviderFallbackStore?: Map<string, Map<string, FallbackRecord>>
}

const fallbackGlobal = globalThis as GlobalApiKeyFallback

const fallbackStore: Map<string, Map<string, FallbackRecord>> =
  fallbackGlobal.__multiLlmProviderFallbackStore ??
  (fallbackGlobal.__multiLlmProviderFallbackStore = new Map<
    string,
    Map<string, FallbackRecord>
  >())

const db = createDbAvailabilityTracker()

const getFallbackUserStore = (userId: string) =>
  getOrCreateUserStore(fallbackStore, userId)

const peekFallbackUserStore = (userId: string) => fallbackStore.get(userId)

const toProviderConfig = (record: FallbackRecord): ProviderConfig => ({
  id: record.id,
  provider: record.provider,
  isActive: record.isActive,
  settings: record.settings ? JSON.parse(record.settings) : undefined,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
})

const getFallbackRecord = (userId: string, provider: string) =>
  peekFallbackUserStore(userId)?.get(provider)

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

  const saveToFallback = () => {
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

  if (db.isKnownUnavailable()) {
    return saveToFallback()
  }

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
    if (!db.markUnavailableIfNeeded(error)) {
      db.logWarningOnce('storeUserApiKey', 'provider config', error)
    }
    return saveToFallback()
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

  if (!db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getUserApiKey', 'provider config', error)
      }
    }
  }

  if (!config) {
    const record = getFallbackRecord(userId, provider)
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
  let configs: Array<{
    id: string
    provider: string
    isActive: boolean
    settings?: string | null
    createdAt: Date
    updatedAt: Date
  }> = []

  if (!db.isKnownUnavailable()) {
    try {
      configs = await prisma.providerConfig.findMany({
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
      }) as typeof configs
    } catch (error) {
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getUserProviderConfigs', 'provider config', error)
      }
    }
  }

  const merged = new Map<string, ProviderConfig>()

  for (const config of configs) {
    merged.set(config.provider, {
      id: config.id,
      provider: config.provider,
      isActive: config.isActive,
      settings: config.settings ? JSON.parse(config.settings) : undefined,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    })
  }

  for (const fallback of peekFallbackUserStore(userId)?.values() ?? []) {
    if (!fallback.isActive || merged.has(fallback.provider)) {
      continue
    }
    merged.set(fallback.provider, toProviderConfig(fallback))
  }

  return Array.from(merged.values())
}

/**
 * Delete a provider configuration
 */
export async function deleteUserProviderConfig(
  userId: string,
  provider: string
): Promise<void> {
  if (!db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('deleteUserProviderConfig', 'provider config', error)
      }
    }
  }

  const store = peekFallbackUserStore(userId)
  if (!store) {
    return
  }
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

/**
 * Check if user has a valid API key for a provider
 */
export async function hasValidApiKey(
  userId: string,
  provider: string
): Promise<boolean> {
  let config: { apiKey: string | null; isActive: boolean } | null = null

  if (!db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('hasValidApiKey', 'provider config', error)
      }
    }
  }

  if (!config) {
    const record = getFallbackRecord(userId, provider)
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
  if (!db.isKnownUnavailable()) {
    try {
      const result = await prisma.providerConfig.updateMany({
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

      if (result.count > 0) {
        const updated = await prisma.providerConfig.findUnique({
          where: {
            userId_provider: {
              userId,
              provider,
            },
          },
        })

        if (updated) {
          return {
            id: updated.id,
            provider: updated.provider,
            isActive: updated.isActive,
            settings: updated.settings ? JSON.parse(updated.settings) : undefined,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
          }
        }
      }
    } catch (error) {
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('updateProviderSettings', 'provider config', error)
      }
    }
  }

  const store = peekFallbackUserStore(userId)
  if (!store) return null
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
