type GlobalRuntimeSecrets = typeof globalThis & {
  __multiLlmLoggedMissingApiKeySeed?: boolean
}

const runtimeGlobal = globalThis as GlobalRuntimeSecrets

const DEV_API_KEY_ENCRYPTION_SEED =
  'local-dev-api-key-encryption-seed-change-before-production'

/**
 * Resolves the API key encryption seed with production-safe behavior:
 * - Production: missing seed throws.
 * - Non-production: missing seed falls back to a stable local seed and logs once.
 */
export const resolveApiKeyEncryptionSeed = (): string => {
  const configuredSeed = process.env.API_KEY_ENCRYPTION_SEED?.trim()
  if (configuredSeed) {
    return configuredSeed
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY_ENCRYPTION_SEED is required in production')
  }

  if (!runtimeGlobal.__multiLlmLoggedMissingApiKeySeed) {
    runtimeGlobal.__multiLlmLoggedMissingApiKeySeed = true
    console.warn(
      'API_KEY_ENCRYPTION_SEED is not set; using local development fallback seed. Set a real seed in .env.local.'
    )
  }

  return DEV_API_KEY_ENCRYPTION_SEED
}

