import { NextResponse } from 'next/server'
import { checkAndConsume } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

type RouteLimit = {
  /** Stable bucket name; the user id is appended. */
  scope: string
  userId: string
  max: number
  windowMs: number
  /**
   * What to do when the shared limiter backend itself is unreachable.
   * 'deny' fails closed (503). 'allow' lets the request through and logs it:
   * use only where blocking would cost more than the abuse it prevents.
   */
  onUnavailable: 'allow' | 'deny'
  /** Extra fields merged into the JSON error body for callers with a fixed shape. */
  errorBody?: (message: string) => Record<string, unknown>
}

const TOO_MANY = 'Too many requests. Please wait a moment and try again.'
const UNAVAILABLE =
  'Request protection is temporarily unavailable. Try again shortly.'

const noStore = { 'Cache-Control': 'no-store' }

/**
 * Per-user throttle for routes that spend money or reach third parties.
 * Returns a ready 429/503 response when the caller must stop, or null when the
 * request may proceed.
 */
export async function enforceRouteLimit(
  limit: RouteLimit,
): Promise<NextResponse | null> {
  const body = (message: string) => ({
    error: message,
    ...(limit.errorBody?.(message) ?? {}),
  })

  try {
    const result = await checkAndConsume(`${limit.scope}:${limit.userId}`, {
      max: limit.max,
      windowMs: limit.windowMs,
    })
    if (result.allowed) return null

    const retryAfterMs =
      'retryAfterMs' in result && typeof result.retryAfterMs === 'number'
        ? result.retryAfterMs
        : limit.windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
    return NextResponse.json(body(TOO_MANY), {
      status: 429,
      headers: { ...noStore, 'Retry-After': String(retryAfterSeconds) },
    })
  } catch {
    if (limit.onUnavailable === 'allow') {
      logger.warn('route_rate_limit_unavailable_allowed', { scope: limit.scope })
      return null
    }
    return NextResponse.json(body(UNAVAILABLE), {
      status: 503,
      headers: { ...noStore, 'Retry-After': '5' },
    })
  }
}
