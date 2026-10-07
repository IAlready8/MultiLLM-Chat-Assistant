import { createHash } from 'node:crypto'
import prisma from '@/lib/prisma'

/** Same sliding-window admission as Redis, serialized across app instances. */
export async function consumePostgresLimit(key: string, cfg: { max: number; windowMs: number }) {
  const id = createHash('sha256').update(key).digest('hex')
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`rate-limit:${id}`}, 0))`
    const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now` as Array<{ now: Date }>
    const timestamp = BigInt(now.getTime())
    const bucket = await tx.rateLimitBucket.findUnique({ where: { id } })
    const recent = (bucket?.timestamps ?? []).filter(time => time > timestamp - BigInt(cfg.windowMs))
    if (recent.length >= cfg.max) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, cfg.windowMs - Number(timestamp - recent[0])) }
    }
    recent.push(timestamp)
    const data = { timestamps: recent, expiresAt: new Date(now.getTime() + cfg.windowMs) }
    await tx.rateLimitBucket.upsert({ where: { id }, create: { id, ...data }, update: data })
    return { allowed: true, remaining: cfg.max - recent.length, retryAfterMs: 0 }
  }, { maxWait: 2_000, timeout: 4_000 })
}

export async function checkPostgresLimitStore() {
  // Verify the required relation too, rather than reporting success from SELECT 1.
  await prisma.$queryRaw`SELECT id FROM "RateLimitBucket" LIMIT 1`
}

export async function prunePostgresLimits() {
  // A bounded batch keeps housekeeping cheap even after an extended outage.
  return prisma.$queryRaw`DELETE FROM "RateLimitBucket" WHERE "expiresAt" < NOW() AND id IN
    (SELECT id FROM "RateLimitBucket" WHERE "expiresAt" < NOW() ORDER BY "expiresAt" LIMIT 1000) RETURNING id`
}
