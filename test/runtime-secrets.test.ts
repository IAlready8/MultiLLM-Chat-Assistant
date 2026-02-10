import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveApiKeyEncryptionSeed } from '@/lib/runtime-secrets'

const originalNodeEnv = process.env.NODE_ENV
const originalSeed = process.env.API_KEY_ENCRYPTION_SEED

declare global {
  // eslint-disable-next-line no-var
  var __multiLlmLoggedMissingApiKeySeed: boolean | undefined
}

const setNodeEnv = (value: string | undefined) => {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

describe('runtime-secrets', () => {
  beforeEach(() => {
    setNodeEnv('test')
    delete process.env.API_KEY_ENCRYPTION_SEED
    globalThis.__multiLlmLoggedMissingApiKeySeed = undefined
  })

  afterEach(() => {
    setNodeEnv(originalNodeEnv)
    if (originalSeed === undefined) {
      delete process.env.API_KEY_ENCRYPTION_SEED
    } else {
      process.env.API_KEY_ENCRYPTION_SEED = originalSeed
    }
    globalThis.__multiLlmLoggedMissingApiKeySeed = undefined
    vi.restoreAllMocks()
  })

  it('returns configured seed when present', () => {
    process.env.API_KEY_ENCRYPTION_SEED = '  seed-123  '

    const seed = resolveApiKeyEncryptionSeed()

    expect(seed).toBe('seed-123')
  })

  it('uses development fallback seed and logs only once when missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = resolveApiKeyEncryptionSeed()
    const second = resolveApiKeyEncryptionSeed()

    expect(first).toBe(
      'local-dev-api-key-encryption-seed-change-before-production'
    )
    expect(second).toBe(
      'local-dev-api-key-encryption-seed-change-before-production'
    )
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('throws in production when encryption seed is missing', () => {
    setNodeEnv('production')

    expect(() => resolveApiKeyEncryptionSeed()).toThrow(
      'API_KEY_ENCRYPTION_SEED is required in production'
    )
  })
})
