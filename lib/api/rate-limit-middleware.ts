/**
 * Advanced Rate Limiting Middleware with Sliding Window Algorithm
 *
 * Provides sophisticated rate limiting beyond basic fixed-window approaches.
 * Supports distributed rate limiting via Redis (when available) and graceful
 * degradation to in-memory tracking for single-instance deployments.
 *
 * @module lib/api/rate-limit-middleware
 */

import { NextRequest, NextResponse } from 'next/server';

// Optional dependencies - gracefully unavailable if not installed
let RatelimitModule: any = null;
let RedisModule: any = null;
try {
  RatelimitModule = require('@upstash/ratelimit').Ratelimit;
  RedisModule = require('@upstash/redis').Redis;
} catch { /* Upstash not installed - in-memory fallback */ }

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  name: string;
  critical?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  limit: number;
  distributed: boolean;
}

export interface RateLimitContext {
  userId?: string;
  ip?: string;
  apiKeyId?: string;
  route?: string;
}

interface SlidingWindowEntry {
  timestamp: number;
  count: number;
}

// ============================================================================
// In-Memory Sliding Window
// ============================================================================

class InMemorySlidingWindow {
  private windows: Map<string, SlidingWindowEntry[]> = new Map();
  private readonly maxEntries = 10000;
  private readonly cleanupIntervalMs = 60000;

  constructor() {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    }
  }

  async check(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    let entries = this.windows.get(key);
    if (!entries) { entries = []; this.windows.set(key, entries); }

    const validEntries = entries.filter(e => e.timestamp > windowStart);
    const currentCount = validEntries.reduce((sum, e) => sum + e.count, 0);

    if (currentCount >= limit) {
      const oldestTimestamp = validEntries.length > 0 ? Math.min(...validEntries.map(e => e.timestamp)) : now;
      return { allowed: false, remaining: 0, reset: oldestTimestamp + windowMs };
    }

    validEntries.push({ timestamp: now, count: 1 });
    if (this.windows.size > this.maxEntries) this.cleanup();

    return { allowed: true, remaining: Math.max(0, limit - currentCount - 1), reset: now + windowMs };
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000;
    for (const [key, entries] of this.windows.entries()) {
      const filtered = entries.filter(e => now - e.timestamp < maxAge);
      if (filtered.length === 0) this.windows.delete(key);
      else this.windows.set(key, filtered);
    }
  }
}

// ============================================================================
// Advanced Rate Limiter
// ============================================================================

export class AdvancedRateLimiter {
  private redis: any = null;
  private redisRatelimit: any = null;
  private inMemoryFallback: InMemorySlidingWindow;

  constructor() {
    this.inMemoryFallback = new InMemorySlidingWindow();
    this.initializeRedis();
  }

  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.log('[RateLimit] Redis not configured, using in-memory fallback');
      return;
    }
    try {
      this.redis = new RedisModule({ url: redisUrl, token: process.env.REDIS_TOKEN || '' });
      this.redisRatelimit = new RatelimitModule({
        redis: this.redis,
        limiter: RatelimitModule.slidingWindow,
        analytics: true,
      });
      console.log('[RateLimit] Redis connection established');
    } catch (error) {
      console.error('[RateLimit] Failed to initialize Redis:', error);
      this.redis = null;
      this.redisRatelimit = null;
    }
  }

  async check(config: RateLimitConfig, context: RateLimitContext): Promise<RateLimitResult> {
    const key = this.buildKey(config.name, context);
    if (this.redisRatelimit) {
      try {
        const result = await this.redisRatelimit.limit(key, {
          window: Math.floor(config.windowMs / 1000), limit: config.limit,
        });
        return { allowed: result.success, remaining: result.remaining, reset: result.reset, limit: config.limit, distributed: true };
      } catch (error) {
        console.error('[RateLimit] Redis check failed:', error);
      }
    }
    return this.checkInMemory(key, config);
  }

  private buildKey(prefix: string, context: RateLimitContext): string {
    const parts = [prefix];
    if (context.userId) parts.push(`user:${context.userId}`);
    else if (context.apiKeyId) parts.push(`key:${context.apiKeyId}`);
    else if (context.ip) parts.push(`ip:${context.ip}`);
    else parts.push('anon:unknown');
    if (context.route) parts.push(`route:${context.route}`);
    return parts.join(':');
  }

  private async checkInMemory(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const result = await this.inMemoryFallback.check(key, config.limit, config.windowMs);
    return { allowed: result.allowed, remaining: result.remaining, reset: result.reset, limit: config.limit, distributed: false };
  }

  static getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;
    return 'unknown';
  }
}

// ============================================================================
// Pre-configured Limits
// ============================================================================

export const RATE_LIMITS = {
  apiDefault: { limit: 60, windowMs: 60000, name: 'api:default' } as RateLimitConfig,
  chat: { limit: 30, windowMs: 60000, name: 'api:chat', critical: true } as RateLimitConfig,
  stream: { limit: 30, windowMs: 60000, name: 'api:stream', critical: true } as RateLimitConfig,
  keyTest: { limit: 10, windowMs: 60000, name: 'api:keytest' } as RateLimitConfig,
  configWrite: { limit: 20, windowMs: 60000, name: 'api:config:write' } as RateLimitConfig,
  auth: { limit: 10, windowMs: 60000, name: 'api:auth' } as RateLimitConfig,
  admin: { limit: 100, windowMs: 60000, name: 'api:admin' } as RateLimitConfig,
  global: { limit: 600, windowMs: 60000, name: 'api:global', critical: true } as RateLimitConfig,
} as const;

// ============================================================================
// Middleware Factory
// ============================================================================

export function createRateLimitMiddleware(config: RateLimitConfig) {
  const limiter = new AdvancedRateLimiter();
  return async (request: NextRequest, context?: RateLimitContext): Promise<RateLimitResult> => {
    return limiter.check(config, {
      ...context,
      ip: context?.ip || AdvancedRateLimiter.getClientIP(request),
      route: context?.route || request.nextUrl.pathname,
    });
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
    'X-RateLimit-Distributed': result.distributed.toString(),
  };
}

export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return NextResponse.json(
    { error: 'Rate limit exceeded', message: `Too many requests. Please retry after ${retryAfter} seconds.`, retryAfter, limit: result.limit, remaining: result.remaining },
    { status: 429, headers: { 'Retry-After': retryAfter.toString(), ...getRateLimitHeaders(result) } }
  );
}

// ============================================================================
// Singleton
// ============================================================================

export const rateLimiter = new AdvancedRateLimiter();

export async function checkRateLimit(config: RateLimitConfig, context: RateLimitContext): Promise<RateLimitResult> {
  return rateLimiter.check(config, context);
}

export async function rateLimitMiddleware(
  request: NextRequest,
  config: RateLimitConfig,
  context?: Partial<RateLimitContext>
): Promise<{ allowed: boolean; result: RateLimitResult }> {
  const result = await rateLimiter.check(config, {
    userId: context?.userId,
    apiKeyId: context?.apiKeyId,
    ip: context?.ip || AdvancedRateLimiter.getClientIP(request),
    route: context?.route || request.nextUrl.pathname,
  });
  return { allowed: result.allowed, result };
}
