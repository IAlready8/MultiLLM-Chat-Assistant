type GlobalProviderRateLimit = typeof globalThis & {
  __multiLlmProviderRateLimits?: Map<string, { count: number; resetTime: number }>
}

export type ProviderRateLimitConfig = {
  requests: number
  window: number
}

const globalRateLimits = globalThis as GlobalProviderRateLimit
const rateLimits =
  globalRateLimits.__multiLlmProviderRateLimits ??
  (globalRateLimits.__multiLlmProviderRateLimits = new Map<string, { count: number; resetTime: number }>())

export function checkProviderRateLimit(
  userId: string,
  provider: string,
  config: ProviderRateLimitConfig,
): boolean {
  if (!Number.isFinite(config.requests) || config.requests < 1) {
    return false
  }

  const key = `rate_limit:${userId}:${provider}`
  const now = Date.now()
  const entry = rateLimits.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + config.window })
    return true
  }

  if (entry.count >= config.requests) {
    return false
  }

  rateLimits.set(key, { count: entry.count + 1, resetTime: entry.resetTime })
  return true
}
