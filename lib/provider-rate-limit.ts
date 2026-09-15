import { checkAndConsume } from '@/lib/rate-limit'

export type ProviderRateLimitConfig = {
  requests: number
  window: number
}

export type ProviderRateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export async function checkProviderRateLimit(
  userId: string,
  provider: string,
  config: ProviderRateLimitConfig,
): Promise<ProviderRateLimitResult> {
  if (
    !Number.isFinite(config.requests) ||
    config.requests < 1 ||
    !Number.isFinite(config.window) ||
    config.window < 1
  ) {
    return { allowed: false, remaining: 0, retryAfterMs: 0 }
  }

  return checkAndConsume(`provider:${userId}:${provider}`, {
    max: Math.floor(config.requests),
    windowMs: Math.floor(config.window),
  })
}
