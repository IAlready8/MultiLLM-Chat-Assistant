import { LlmRequestError } from '@/lib/llm-request'
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
  scope: 'distributed' | 'per-instance'
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

let connecting: Promise<void> | null = null
let retryConnectionAt = 0
const requiresDistributedLimits = () => process.env.NODE_ENV === 'production' || process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT === 'true'

async function initRedis() {
  if (connecting) return connecting
  if (!process.env.REDIS_URL || isRedisConnected || Date.now() < retryConnectionAt) return
  connecting = (async () => {
    try {
      const client = createClient({
        url: process.env.REDIS_URL,
        disableOfflineQueue: true,
        socket: { connectTimeout: 2_000, reconnectStrategy: false },
      })
      redisClient = client
      client.on('error', () => {
        logger.warn('rate_limit_redis_client_error')
        isRedisConnected = false
      })
      await client.connect()
      isRedisConnected = true
    } catch {
      logger.warn('rate_limit_redis_connect_failed')
      if (redisClient?.isOpen) redisClient.destroy()
      redisClient = null
      isRedisConnected = false
      retryConnectionAt = Date.now() + 5_000
    }
  })().finally(() => { connecting = null })
  return connecting
}

void initRedis()

function unavailableOrMemory(key: Key, cfg: LimitConfig) {
  if (requiresDistributedLimits()) throw new LlmRequestError('Request protection is temporarily unavailable. Try again shortly.', 503, 'RATE_LIMIT_UNAVAILABLE', 5)
  return checkAndConsumeInMemory(key, cfg)
}

function now() {
  return Date.now()
}

// In-memory fallback implementation
function checkAndConsumeInMemory(key: Key, cfg: LimitConfig) {
  const t = now()
  if (hits.size >= 10_000 && !hits.has(key)) {
    for (const [storedKey, timestamps] of hits) {
      if ((timestamps.at(-1) ?? 0) < t - 86_400_000) hits.delete(storedKey)
    }
    if (hits.size >= 10_000) return { allowed: false as const, remaining: 0, retryAfterMs: cfg.windowMs }
  }
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
    return unavailableOrMemory(key, cfg)
  }

  try {
    const timestamp = now()
    const member = `${timestamp}-${Math.random()}`
    const result = await redisClient.withCommandOptions({ abortSignal: AbortSignal.timeout(2_000) }).eval(REDIS_SLIDING_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [
        String(timestamp),
        String(cfg.windowMs),
        String(cfg.max),
        member,
      ],
    }) as Array<number | string>
    if (!Array.isArray(result) || result.length !== 3 || result.some(value => !Number.isFinite(Number(value)))) throw new Error('Invalid limiter response')
    const [allowed, remaining, retryAfterMs] = result.map(Number)

    return {
      allowed: allowed === 1,
      remaining: Math.max(0, remaining),
      retryAfterMs: Math.max(0, retryAfterMs),
    }
  } catch {
    logger.warn('rate_limit_redis_request_failed')
    return unavailableOrMemory(key, cfg)
  }
}

export async function checkAndConsume(key: Key, cfg: LimitConfig) {
  await initRedis()
  if (redisClient && isRedisConnected) {
    return checkAndConsumeRedis(key, cfg);
  }
  return unavailableOrMemory(key, cfg);
}

export function resetAll() {
  hits.clear()
}

export function getRateLimitDiagnostics(): RateLimitDiagnostics {
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim())
  const redisConnected = Boolean(redisClient && isRedisConnected)
  const status =
    redisConnected ? 'connected' : redisConfigured || requiresDistributedLimits() ? 'degraded' : 'memory'
  const scope = redisConnected ? 'distributed' : 'per-instance'
  const message =
    status === 'connected'
      ? 'Redis-backed rate limiting is connected'
      : requiresDistributedLimits()
        ? 'Distributed rate limiting unavailable; requests are blocked'
      : status === 'degraded'
        ? 'Redis configured but unavailable; using per-instance in-memory rate limiting'
        : 'Redis not configured; using per-instance in-memory rate limiting'

  return {
    mode: redisConnected ? 'redis' : 'memory',
    status,
    scope,
    message,
    redisConfigured,
    redisConnected,
    inMemoryKeys: hits.size,
  }
}
