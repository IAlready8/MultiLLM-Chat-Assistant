/**
 * Unified error classifier for the provider runtime.
 *
 * Merges the previously duplicated mapErrorToResponse (chat route) and
 * classifyStreamError (stream route) into a single canonical function so that
 * both endpoints return identical error codes for identical failure modes.
 */

import { NotImplementedError } from '@/lib/error-system'
import type { ClassifiedError } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_RE = /\bHTTP\s+(\d{3})\b/i

function parseUpstreamStatus(message: string): number | null {
  const match = message.match(STATUS_RE)
  if (!match) return null
  const status = Number(match[1])
  return Number.isFinite(status) ? status : null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify an arbitrary thrown value into a deterministic HTTP error shape.
 *
 * Order of precedence:
 *  1. SyntaxError         -> 502 PROVIDER_MALFORMED_RESPONSE
 *  2. NotImplementedError -> 501 FEATURE_NOT_IMPLEMENTED
 *  3. Upstream 401/403    -> 401 PROVIDER_AUTH_ERROR
 *  4. Upstream 429        -> 429 RATE_LIMITED
 *  5. Upstream 5xx        -> 503 PROVIDER_UNAVAILABLE
 *  6. Timeout / abort     -> 504 PROVIDER_TIMEOUT
 *  7. Malformed payload   -> 502 PROVIDER_MALFORMED_RESPONSE
 *  8. Network errors      -> 503 NETWORK_ERROR
 *  9. Other 4xx           -> 400 PROVIDER_REQUEST_ERROR
 * 10. Fallback            -> 500 INTERNAL_ERROR
 */
export function classifyProviderError(error: unknown): ClassifiedError {
  if (error instanceof SyntaxError) {
    return {
      status: 502,
      code: 'PROVIDER_MALFORMED_RESPONSE',
      error: 'Provider returned malformed response',
    }
  }

  if (error instanceof NotImplementedError) {
    return {
      status: 501,
      code: 'FEATURE_NOT_IMPLEMENTED',
      error: error.userMessage || 'This feature is not yet available.',
    }
  }

  if (
    error instanceof Error &&
    'code' in error &&
    (error as { code?: unknown }).code === 'RATE_001'
  ) {
    const retryAfterMs = Number(
      (error as { context?: { metadata?: { retryAfter?: unknown } } })
        .context?.metadata?.retryAfter,
    )
    const userMessage =
      'userMessage' in error && typeof error.userMessage === 'string'
        ? error.userMessage
        : 'Provider rate limit reached, please retry shortly'
    return {
      status: 429,
      code: 'RATE_LIMITED',
      error: userMessage,
      retryAfterSeconds: Number.isFinite(retryAfterMs)
        ? Math.max(1, Math.ceil(retryAfterMs / 1000))
        : undefined,
    }
  }

  const message =
    error instanceof Error ? error.message : 'An internal server error occurred'
  const lower = message.toLowerCase()
  const upstreamStatus = parseUpstreamStatus(message)

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 401,
      code: 'PROVIDER_AUTH_ERROR',
      error: 'Provider rejected the configured API key',
    }
  }

  if (upstreamStatus === 429) {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      error: 'Provider rate limit reached, please retry shortly',
    }
  }

  if (upstreamStatus !== null && upstreamStatus >= 500) {
    return {
      status: 503,
      code: 'PROVIDER_UNAVAILABLE',
      error: 'Provider is currently unavailable',
    }
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('abort')
  ) {
    return {
      status: 504,
      code: 'PROVIDER_TIMEOUT',
      error: 'Provider request timed out',
    }
  }

  if (
    lower.includes('malformed') ||
    lower.includes('invalid json') ||
    lower.includes('no response body')
  ) {
    return {
      status: 502,
      code: 'PROVIDER_MALFORMED_RESPONSE',
      error: 'Provider returned malformed response',
    }
  }

  if (
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again')
  ) {
    return {
      status: 503,
      code: 'NETWORK_ERROR',
      error: 'Failed to reach upstream provider',
    }
  }

  if (upstreamStatus !== null && upstreamStatus >= 400) {
    return {
      status: 400,
      code: 'PROVIDER_REQUEST_ERROR',
      error: message,
    }
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    error: message,
  }
}
