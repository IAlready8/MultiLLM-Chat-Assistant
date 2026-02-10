// Conditional import for Redis
let createClient: any = null;
let RedisClientType: any = null;

try {
  const redis = require('redis');
  createClient = redis.createClient;
  RedisClientType = redis.RedisClientType;
} catch (error) {
  console.warn('Redis not available for rate limiting, using memory-only implementation');
}

type Key = string

interface LimitConfig {
  windowMs: number
  max: number
}

export interface RateLimitDiagnostics {
  mode: 'redis' | 'memory'
  redisConfigured: boolean
  redisConnected: boolean
  inMemoryKeys: number
}

// Simple in-memory sliding window limiter (dev/default)
const hits = new Map<Key, number[]>()

// Redis client instance
let redisClient: any = null;
let isRedisConnected = false;

// Initialize Redis connection if REDIS_URL is provided
async function initRedis() {
  if (!process.env.REDIS_URL || redisClient || !createClient) return;
  
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL
    });
    
    redisClient.on('error', (err: Error) => {
      console.error('Redis Client Error', err);
      isRedisConnected = false;
    });
    
    await redisClient.connect();
    isRedisConnected = true;
    console.log('Redis client connected successfully');
  } catch (error) {
    console.error('Failed to connect to Redis, falling back to in-memory', error);
    redisClient = null;
    isRedisConnected = false;
  }
}

// Initialize Redis on module load
initRedis().catch(console.error);

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
    return checkAndConsumeInMemory(key, cfg);
  }
  
  try {
    const timestamp = now();
    const windowStart = timestamp - cfg.windowMs;
    
    // Use Redis transactions for atomic operations
    const multi = redisClient.multi();
    
    // Remove old entries outside the window
    multi.zRemRangeByScore(key, 0, windowStart);
    
    // Count current requests in window
    multi.zCard(key);
    
    // Add current request
    multi.zAdd(key, { score: timestamp, value: `${timestamp}-${Math.random()}` });
    
    // Set expiration to clean up old keys automatically
    multi.expire(key, Math.ceil(cfg.windowMs / 1000) + 10);
    
    const results = await multi.exec();
    
    // The second result (index 1) is the count from zcard
    const currentCount = Number(results[1]);
    
    if (currentCount >= cfg.max) {
      // Get the oldest timestamp to calculate retry time
      const oldest = await redisClient.zRangeWithScores(key, 0, 0);
      const retryAfterMs = oldest.length > 0 ? cfg.windowMs - (timestamp - oldest[0].score) : 0;
      return { allowed: false as const, remaining: Math.max(0, cfg.max - currentCount), retryAfterMs }
    }
    
    return { allowed: true as const, remaining: Math.max(0, cfg.max - currentCount), retryAfterMs: 0 }
  } catch (error) {
    console.error('Redis rate limiting error, falling back to in-memory', error);
    return checkAndConsumeInMemory(key, cfg);
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
    redisClient.flushAll().catch(console.error);
  }
}

export function getRateLimitDiagnostics(): RateLimitDiagnostics {
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim())
  const redisConnected = Boolean(redisClient && isRedisConnected)

  return {
    mode: redisConnected ? 'redis' : 'memory',
    redisConfigured,
    redisConnected,
    inMemoryKeys: hits.size,
  }
}
