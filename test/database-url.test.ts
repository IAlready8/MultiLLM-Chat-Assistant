import { afterEach, describe, expect, it, vi } from 'vitest'

const mockPrismaPg = vi.fn()
const mockPrismaClient = vi.fn()

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(config: unknown) {
      mockPrismaPg(config)
    }
  },
}))

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      mockPrismaClient(options)
    }
  },
}))

vi.mock('@/lib/startup-validation', () => ({
  validateStartupEnvironment: vi.fn(),
}))

import {
  buildPgPoolConfig,
  DATABASE_CONNECT_TIMEOUT_MS,
  getDatabaseUrl,
  hasDatabaseUrl,
} from '@/lib/database-url'

describe('database url helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    mockPrismaPg.mockReset()
    mockPrismaClient.mockReset()
    delete (globalThis as { __multiLlmPrismaClient?: unknown }).__multiLlmPrismaClient
  })

  it('prefers DATABASE_URL and falls back to POSTGRES_DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', ' postgresql://primary/db ')
    vi.stubEnv('POSTGRES_DATABASE_URL', 'postgresql://fallback/db')
    expect(getDatabaseUrl()).toBe('postgresql://primary/db')

    vi.stubEnv('DATABASE_URL', '')
    expect(getDatabaseUrl()).toBe('postgresql://fallback/db')

    vi.stubEnv('POSTGRES_DATABASE_URL', '  ')
    expect(getDatabaseUrl()).toBeUndefined()
    expect(hasDatabaseUrl()).toBe(false)
  })

  it('bounds new connection attempts instead of waiting indefinitely', () => {
    expect(DATABASE_CONNECT_TIMEOUT_MS).toBeGreaterThan(0)
    expect(DATABASE_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(15_000)
    expect(buildPgPoolConfig('postgresql://ci:ci@localhost:5432/app')).toEqual({
      connectionString: 'postgresql://ci:ci@localhost:5432/app',
      connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
    })
  })

  it('creates the Prisma pg adapter with the bounded pool config', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL', 'postgresql://ci:ci@localhost:5432/app')
    vi.resetModules()

    await import('@/lib/prisma')

    expect(mockPrismaPg).toHaveBeenCalledTimes(1)
    expect(mockPrismaPg).toHaveBeenCalledWith({
      connectionString: 'postgresql://ci:ci@localhost:5432/app',
      connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
    })
    expect(mockPrismaClient).toHaveBeenCalledTimes(1)
  })
})
