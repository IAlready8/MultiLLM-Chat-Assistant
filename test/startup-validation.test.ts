import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetStartupValidationForTests,
  validateStartupEnvironment,
} from '@/lib/startup-validation'

const trackedKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'AUTH_SECRET',
  'NEXTAUTH_URL',
  'API_KEY_ENCRYPTION_SEED',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRO_PRICE_ID',
  'STRIPE_WEBHOOK_SECRET',
] as const

const originalValues: Record<string, string | undefined> = {}
for (const key of trackedKeys) {
  originalValues[key] = process.env[key]
}

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

const setProductionBase = () => {
  setEnvVar('NODE_ENV', 'production')
  setEnvVar('DATABASE_URL', 'postgresql://localhost:5432/test')
  setEnvVar('NEXTAUTH_SECRET', 'test-secret')
  setEnvVar('AUTH_SECRET', undefined)
  setEnvVar('NEXTAUTH_URL', 'https://example.com')
  setEnvVar('API_KEY_ENCRYPTION_SEED', 'seed-123')
  setEnvVar('GOOGLE_CLIENT_ID', undefined)
  setEnvVar('GOOGLE_CLIENT_SECRET', undefined)
  setEnvVar('GITHUB_CLIENT_ID', undefined)
  setEnvVar('GITHUB_CLIENT_SECRET', undefined)
  setEnvVar('STRIPE_SECRET_KEY', undefined)
  setEnvVar('STRIPE_PRO_PRICE_ID', undefined)
  setEnvVar('STRIPE_WEBHOOK_SECRET', undefined)
}

describe('startup environment validation', () => {
  beforeEach(() => {
    for (const key of trackedKeys) {
      setEnvVar(key, undefined)
    }
    setEnvVar('NODE_ENV', 'test')
    __resetStartupValidationForTests()
  })

  afterEach(() => {
    for (const key of trackedKeys) {
      setEnvVar(key, originalValues[key])
    }
    __resetStartupValidationForTests()
  })

  it('does not enforce production requirements outside production', () => {
    expect(() => validateStartupEnvironment()).not.toThrow()
  })

  it('throws in production when required core env vars are missing', () => {
    setEnvVar('NODE_ENV', 'production')

    expect(() => validateStartupEnvironment()).toThrow(
      'Startup environment validation failed:'
    )
    expect(() => validateStartupEnvironment()).toThrow(
      'DATABASE_URL is required in production.'
    )
  })

  it('passes in production when required core env vars are present', () => {
    setProductionBase()

    expect(() => validateStartupEnvironment()).not.toThrow()
  })

  it('throws when Stripe is partially configured', () => {
    setProductionBase()
    setEnvVar('STRIPE_SECRET_KEY', 'sk_test_123')

    expect(() => validateStartupEnvironment()).toThrow(
      'Stripe billing requires STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, and STRIPE_WEBHOOK_SECRET together when enabled.'
    )
  })

  it('throws when OAuth provider env is partially configured', () => {
    setProductionBase()
    setEnvVar('GOOGLE_CLIENT_ID', 'google-id')

    expect(() => validateStartupEnvironment()).toThrow(
      'Google OAuth requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    )
  })
})
