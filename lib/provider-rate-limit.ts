import { checkAndConsume, type RateLimitResult } from '@/lib/rate-limit'

export type ProviderRateLimitConfig = {
  requests: number
  window: number
}

export async function checkProviderRateLimit(
  userId: string,
  provider: string,
  config: ProviderRateLimitConfig,
): Promise<RateLimitResult> {
  if (!Number.isFinite(config.requests) || config.requests < 1) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Number.isFinite(config.window) && config.window > 0 ? config.window : 0,
      reason: 'rate_limited',
    }
  }

  return checkAndConsume(`provider:${userId}:${provider}`, {
    windowMs: config.window,
    max: config.requests,
  })
}
