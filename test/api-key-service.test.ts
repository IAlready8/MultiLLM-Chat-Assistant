import { beforeEach, describe, expect, it, vi } from 'vitest'

const DB_UNAVAILABLE_ERROR = new Error(
  'Database access for providerConfig is not available in this environment.'
)

type PrismaMock = {
  providerConfig: {
    upsert: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

type CryptoMocks = {
  deriveKey: ReturnType<typeof vi.fn>
  aesGcmEncrypt: ReturnType<typeof vi.fn>
  aesGcmDecrypt: ReturnType<typeof vi.fn>
}

const makePrismaMock = (): PrismaMock => ({
  providerConfig: {
    upsert: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    findUnique: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    findMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    updateMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
  },
})

const makeDefaultCryptoMocks = (): CryptoMocks => ({
  deriveKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  aesGcmEncrypt: vi.fn().mockResolvedValue('encrypted-api-key'),
  aesGcmDecrypt: vi.fn().mockResolvedValue('decrypted-api-key'),
})

const loadServiceWithPrismaMock = async (
  prismaMock: PrismaMock,
  cryptoMocks: CryptoMocks = makeDefaultCryptoMocks()
) => {
  vi.doMock('@/lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }))
  vi.doMock('@/lib/runtime-secrets', () => ({
    resolveApiKeyEncryptionSeed: () => 'test-seed-for-api-key-service',
  }))
  vi.doMock('@/lib/crypto', () => cryptoMocks)

  return await import('@/lib/api-key-service')
}

describe('api-key-service production fail-closed behavior', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __multiLlmProviderFallbackStore?: unknown })
      .__multiLlmProviderFallbackStore
  })

  it('throws on provider config reads when DB is unavailable in production', async () => {
    const env = process.env as Record<string, string | undefined>
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'

    try {
      const service = await loadServiceWithPrismaMock(makePrismaMock())

      await expect(service.getUserProviderConfigs('user-1')).rejects.toThrow(
        DB_UNAVAILABLE_ERROR.message
      )
      await expect(service.getUserApiKey('user-1', 'openai')).rejects.toThrow(
        DB_UNAVAILABLE_ERROR.message
      )
      await expect(service.hasValidApiKey('user-1', 'openai')).rejects.toThrow(
        DB_UNAVAILABLE_ERROR.message
      )
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })

  it('throws on provider config writes when DB is unavailable in production', async () => {
    const env = process.env as Record<string, string | undefined>
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'

    try {
      const service = await loadServiceWithPrismaMock(makePrismaMock())

      await expect(
        service.storeUserApiKey('user-1', 'openai', 'sk-test', {
          model: 'gpt-4.1',
        })
      ).rejects.toThrow(DB_UNAVAILABLE_ERROR.message)

      await expect(
        service.deleteUserProviderConfig('user-1', 'openai')
      ).rejects.toThrow(DB_UNAVAILABLE_ERROR.message)

      await expect(
        service.updateProviderSettings('user-1', 'openai', {
          model: 'gpt-4.1',
        })
      ).rejects.toThrow(DB_UNAVAILABLE_ERROR.message)
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })
})

describe('api-key-service encryption contract', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __multiLlmProviderFallbackStore?: unknown })
      .__multiLlmProviderFallbackStore
  })

  it('stores encrypted values and only exposes decrypted key via server helper', async () => {
    const env = process.env as Record<string, string | undefined>
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'test'

    const records = new Map<
      string,
      {
        id: string
        userId: string
        provider: string
        apiKey: string | null
        settings: string | null
        isActive: boolean
        createdAt: Date
        updatedAt: Date
      }
    >()

    try {
      const prismaMock: PrismaMock = {
        providerConfig: {
          upsert: vi.fn().mockImplementation(async ({ where, update, create }: any) => {
            const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`
            const now = new Date('2026-03-02T00:00:00.000Z')
            const existing = records.get(key)

            const next = existing
              ? {
                  ...existing,
                  ...update,
                  updatedAt: now,
                }
              : {
                  id: `cfg-${records.size + 1}`,
                  userId: create.userId,
                  provider: create.provider,
                  apiKey: create.apiKey,
                  settings: create.settings,
                  isActive: create.isActive,
                  createdAt: now,
                  updatedAt: now,
                }

            records.set(key, next)
            return next
          }),
          findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
            const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`
            return records.get(key) ?? null
          }),
          findMany: vi.fn().mockImplementation(async ({ where }: any) => {
            return Array.from(records.values()).filter(
              (record) =>
                record.userId === where.userId &&
                record.isActive === where.isActive
            )
          }),
          updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
            const key = `${where.userId}:${where.provider}`
            const existing = records.get(key)
            if (!existing) {
              return { count: 0 }
            }
            records.set(key, {
              ...existing,
              ...data,
              updatedAt: new Date('2026-03-02T00:00:01.000Z'),
            })
            return { count: 1 }
          }),
        },
      }

      const cryptoMocks: CryptoMocks = {
        deriveKey: vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9])),
        aesGcmEncrypt: vi
          .fn()
          .mockImplementation(async (_key: Uint8Array, plaintext: string) => `enc:${plaintext}`),
        aesGcmDecrypt: vi
          .fn()
          .mockImplementation(async (_key: Uint8Array, token: string) =>
            token.startsWith('enc:') ? token.slice(4) : ''
          ),
      }

      const service = await loadServiceWithPrismaMock(prismaMock, cryptoMocks)
      const rawKey = 'sk-secret-123'

      await service.storeUserApiKey('user-1', 'openai', rawKey, {
        models: ['gpt-4'],
      })

      const stored = records.get('user-1:openai')
      expect(stored).toBeDefined()
      expect(stored?.apiKey).toBe('enc:sk-secret-123')
      expect(stored?.apiKey).not.toBe(rawKey)

      const decrypted = await service.getUserApiKey('user-1', 'openai')
      expect(decrypted).toBe(rawKey)

      const configs = await service.getUserProviderConfigs('user-1')
      expect(configs).toHaveLength(1)
      expect(configs[0]).toMatchObject({
        provider: 'openai',
        isActive: true,
      })
      expect('apiKey' in configs[0]).toBe(false)

      await service.storeUserApiKey('user-1', 'deepseek', '', {
        models: ['deepseek-ai/DeepSeek-V4-Flash-0731'],
      })

      const deepSeekConfig = records.get('user-1:deepseek')
      expect(deepSeekConfig?.apiKey).toBeNull()
      expect(cryptoMocks.aesGcmEncrypt).toHaveBeenCalledTimes(1)
      await expect(
        service.getUserApiKey('user-1', 'deepseek')
      ).resolves.toBeNull()
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })
})
