import { logger } from '@/lib/logger'

// Conditional import for Redis
let createClient: any = null

try {
  const redis = require('redis')
  createClient = redis.createClient
} catch (error) {
  logger.warn('rate_limit_redis_module_unavailable', {
    reason: 'Redis package unavailable; using in-memory rate limiting',
  })
}

type Key = string

interface LimitConfig {
  windowMs: number
  max: number
}

export interface RateLimitDiagnostics {
  mode: 'redis' | 'memory'
  status: 'connected' | 'degraded' | 'memory'
  message: string
  redisConfigured: boolean
  redisConnected: boolean
  inMemoryKeys: number
}

// Simple in-memory sliding window limiter (dev/default)
const hits = new Map<Key, number[]>()

// Redis client instance
let redisClient: any = null
let isRedisConnected = false

// Initialize Redis connection if REDIS_URL is provided
async function initRedis() {
  if (!process.env.REDIS_URL || redisClient || !createClient) return

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
    })

    redisClient.on('error', (err: Error) => {
      logger.warn('rate_limit_redis_client_error', { error: err })
      isRedisConnected = false
    })

    await redisClient.connect()
    isRedisConnected = true
    logger.info('rate_limit_redis_connected')
  } catch (error) {
    logger.warn('rate_limit_redis_connect_failed', {
      error,
      fallback: 'memory',
    })
    redisClient = null
    isRedisConnected = false
  }
}

// Initialize Redis on module load
initRedis().catch((error) => {
  logger.error('rate_limit_init_failed', { error })
})

function now() {
  return Date.now()
}

// In-memory fallback implementation
function checkAndConsumeInMemory(key: Key, cfg: LimitConfig) {
  const t = now()
  const windowStart = t - cfg.windowMs
  const arr = hits.get(key) || []
  const recent = arr.filter((ts) => ts > windowStart)
  if (recent.length >= cfg.max) {
    const retryAfterMs = cfg.windowMs - (t - recent[0])
    return { allowed: false as const, remaining: Math.max(0, cfg.max - recent.length), retryAfterMs }
  }
  recent.push(t)
  hits.set(key, recent)
  return { allowed: true as const, remaining: Math.max(0, cfg.max - recent.length), retryAfterMs: 0 }
}

// Redis-based implementation
async function checkAndConsumeRedis(key: Key, cfg: LimitConfig) {
  if (!redisClient || !isRedisConnected) {
    return checkAndConsumeInMemory(key, cfg)
  }

  try {
    const timestamp = now()
    const windowStart = timestamp - cfg.windowMs

    // Use Redis transactions for atomic operations
    const multi = redisClient.multi()

    // Remove old entries outside the window
    multi.zRemRangeByScore(key, 0, windowStart)

    // Count current requests in window
    multi.zCard(key)

    // Add current request
    multi.zAdd(key, { score: timestamp, value: `${timestamp}-${Math.random()}` })

    // Set expiration to clean up old keys automatically
    multi.expire(key, Math.ceil(cfg.windowMs / 1000) + 10)

    const results = await multi.exec()

    // The second result (index 1) is the count from zcard
    const currentCount = Number(results[1])

    if (currentCount >= cfg.max) {
      // Get the oldest timestamp to calculate retry time
      const oldest = await redisClient.zRangeWithScores(key, 0, 0)
      const retryAfterMs =
        oldest.length > 0 ? cfg.windowMs - (timestamp - oldest[0].score) : 0
      return { allowed: false as const, remaining: Math.max(0, cfg.max - currentCount), retryAfterMs }
    }

    return {
      allowed: true as const,
      remaining: Math.max(0, cfg.max - currentCount),
      retryAfterMs: 0,
    }
  } catch (error) {
    logger.warn('rate_limit_redis_request_failed', {
      error,
      fallback: 'memory',
    })
    return checkAndConsumeInMemory(key, cfg)
  }
}

export async function checkAndConsume(key: Key, cfg: LimitConfig) {
  if (redisClient && isRedisConnected) {
    return checkAndConsumeRedis(key, cfg);
  }
  return Promise.resolve(checkAndConsumeInMemory(key, cfg));
}

export function resetAll() {
  hits.clear()
  if (redisClient && isRedisConnected) {
    redisClient.flushAll().catch((error: unknown) => {
      logger.warn('rate_limit_redis_flush_failed', { error })
    })
  }
}

export function getRateLimitDiagnostics(): RateLimitDiagnostics {
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim())
  const redisConnected = Boolean(redisClient && isRedisConnected)
  const status =
    redisConnected ? 'connected' : redisConfigured ? 'degraded' : 'memory'
  const message =
    status === 'connected'
      ? 'Redis-backed rate limiting is connected'
      : status === 'degraded'
        ? 'Redis configured but unavailable; using in-memory rate limiting'
        : 'Redis not configured; using in-memory rate limiting'

  return {
    mode: redisConnected ? 'redis' : 'memory',
    status,
    message,
    redisConfigured,
    redisConnected,
    inMemoryKeys: hits.size,
  }
}
