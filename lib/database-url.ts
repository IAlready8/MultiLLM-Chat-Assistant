export const getDatabaseUrl = (): string | undefined =>
  process.env.DATABASE_URL?.trim() || process.env.POSTGRES_DATABASE_URL?.trim() || undefined

export const hasDatabaseUrl = (): boolean => Boolean(getDatabaseUrl())
