import { logger } from '@/lib/logger'
import { createClient } from 'redis'

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
let redisClient: ReturnType<typeof createClient> | null = null
let isRedisConnected = false

// Initialize Redis connection if REDIS_URL is provided
async function initRedis() {
  if (!process.env.REDIS_URL || redisClient) return

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

const REDIS_SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local timestamp = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, timestamp - window_ms)
local current_count = redis.call('ZCARD', key)

if current_count >= max_requests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after_ms = 0
  if #oldest >= 2 then
    retry_after_ms = math.max(0, window_ms - (timestamp - tonumber(oldest[2])))
  end
  return {0, math.max(0, max_requests - current_count), retry_after_ms}
end

redis.call('ZADD', key, timestamp, member)
redis.call('PEXPIRE', key, window_ms + 10000)
return {1, math.max(0, max_requests - current_count - 1), 0}
`

// Redis-based implementation
async function checkAndConsumeRedis(key: Key, cfg: LimitConfig) {
  if (!redisClient || !isRedisConnected) {
    return checkAndConsumeInMemory(key, cfg)
  }

  try {
    const timestamp = now()
    const member = `${timestamp}-${Math.random()}`
    const result = await redisClient.eval(REDIS_SLIDING_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [
        String(timestamp),
        String(cfg.windowMs),
        String(cfg.max),
        member,
      ],
    }) as Array<number | string>
    const [allowed, remaining, retryAfterMs] = result.map(Number)

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, remaining),
      retryAfterMs: Math.max(0, retryAfterMs),
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
