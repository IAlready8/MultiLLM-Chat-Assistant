import type { PoolConfig } from 'pg'

export const getDatabaseUrl = (): string | undefined =>
  process.env.DATABASE_URL?.trim() || process.env.POSTGRES_DATABASE_URL?.trim() || undefined

export const hasDatabaseUrl = (): boolean => Boolean(getDatabaseUrl())

// node-postgres waits indefinitely for a new connection by default
// (connectionTimeoutMillis = 0). On serverless that turns an unreachable or
// stalled database into requests that hang until the platform kills the
// function. Fail the connection attempt instead, with enough headroom for a
// serverless Postgres compute to wake from suspend.
export const DATABASE_CONNECT_TIMEOUT_MS = 10_000

export const buildPgPoolConfig = (connectionString: string): PoolConfig => ({
  connectionString,
  connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
})
