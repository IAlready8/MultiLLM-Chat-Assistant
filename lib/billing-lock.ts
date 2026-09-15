import { prisma } from '@/lib/prisma'
import type { PrismaClient } from '@/types/prisma'

export function withBillingLock<T>(key: string, work: (tx: PrismaClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    return work(tx)
  }, { maxWait: 5_000, timeout: 25_000 })
}
