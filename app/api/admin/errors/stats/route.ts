import { NextResponse } from 'next/server'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'
import { getAuthenticatedAdmin } from '@/lib/api-auth'
import { errorManager } from '@/lib/error-system'
import { getParsedAnalyticsEvents } from '@/services/analytics-service'

type ErrorCategory =
  | 'validation'
  | 'network'
  | 'provider'
  | 'database'
  | 'authentication'
  | 'unknown'

type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

type ErrorStatsResponse = {
  total: number
  byCategory: Record<ErrorCategory, number>
  bySeverity: Record<ErrorSeverity, number>
  topErrors: Array<{ code: string; count: number }>
}

const DAY_MS = 24 * 60 * 60 * 1000

const zeroByCategory = (): Record<ErrorCategory, number> => ({
  validation: 0,
  network: 0,
  provider: 0,
  database: 0,
  authentication: 0,
  unknown: 0,
})

const zeroBySeverity = (): Record<ErrorSeverity, number> => ({
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
})

const toValidDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

const normalizeCategory = (value: unknown): ErrorCategory => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  switch (raw) {
    case 'validation':
      return 'validation'
    case 'network':
      return 'network'
    case 'provider':
    case 'llm_provider':
    case 'rate_limit':
      return 'provider'
    case 'database':
      return 'database'
    case 'authentication':
      return 'authentication'
    default:
      return 'unknown'
  }
}

const normalizeSeverity = (value: unknown): ErrorSeverity => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  switch (raw) {
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
      return 'high'
    case 'critical':
      return 'critical'
    default:
      return 'medium'
  }
}

const classifyAnalyticsError = (payload: Record<string, unknown>) => {
  const reason = String(payload.reason || '').toLowerCase()
  const statusCode =
    typeof payload.status === 'number'
      ? payload.status
      : typeof payload.statusCode === 'number'
        ? payload.statusCode
        : undefined

  const category =
    reason.includes('network') ||
    reason.includes('timeout') ||
    reason.includes('unreachable') ||
    reason.includes('fetch')
      ? 'network'
      : reason.includes('auth') ||
          reason.includes('unauthorized') ||
          reason.includes('session')
        ? 'authentication'
        : reason.includes('database') ||
            reason.includes('prisma') ||
            reason.includes('sql')
          ? 'database'
          : 'provider'

  const severity: ErrorSeverity =
    statusCode === 429
      ? 'medium'
      : statusCode !== undefined && statusCode >= 500
        ? 'high'
        : category === 'database' || category === 'authentication'
          ? 'high'
          : 'medium'

  const rawCode = String(payload.code || payload.errorCode || '').trim()
  const code =
    rawCode ||
    (statusCode === 429
      ? 'LLM_RATE_LIMIT'
      : category === 'network'
        ? 'LLM_NETWORK_ERROR'
        : category === 'authentication'
          ? 'LLM_AUTH_ERROR'
          : category === 'database'
            ? 'LLM_DB_ERROR'
            : 'LLM_PROVIDER_ERROR')

  return {
    category: category as ErrorCategory,
    severity,
    code,
  }
}

const getDateRange = async (request: Request): Promise<{ from: Date; to: Date } | null> => {
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 7 * DAY_MS)

  let from = defaultFrom
  let to = now

  try {
    const body = (await request.json()) as { from?: unknown; to?: unknown }
    const parsedFrom = toValidDate(body?.from)
    const parsedTo = toValidDate(body?.to)
    if (parsedFrom) from = parsedFrom
    if (parsedTo) to = parsedTo
  } catch {
    // Allow empty/invalid JSON and use default date range.
  }

  if (from.getTime() > to.getTime()) {
    return null
  }

  return { from, to }
}

export const POST = withApiMetrics(async (request: Request) => {
  const authCheck = await getAuthenticatedAdmin()
  if (authCheck instanceof NextResponse) {
    return authCheck
  }

  const range = await getDateRange(request)
  if (!range) {
    return NextResponse.json(
      { error: 'Invalid date range: "from" must be before "to".' },
      { status: 400 }
    )
  }

  const { from, to } = range
  const byCategory = zeroByCategory()
  const bySeverity = zeroBySeverity()
  const codeCounts = new Map<string, number>()
  let total = 0

  try {
    const baseStats = await errorManager.getErrorStats({ from, to })

    Object.entries(baseStats.byCategory).forEach(([rawCategory, count]) => {
      if (!count || count <= 0) return
      const category = normalizeCategory(rawCategory)
      byCategory[category] += count
    })

    Object.entries(baseStats.bySeverity).forEach(([rawSeverity, count]) => {
      if (!count || count <= 0) return
      const severity = normalizeSeverity(rawSeverity)
      bySeverity[severity] += count
    })

    baseStats.topErrors.forEach(({ code, count }) => {
      if (!code || count <= 0) return
      codeCounts.set(code, (codeCounts.get(code) || 0) + count)
    })

    total += baseStats.total

    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS))
    const events = await getParsedAnalyticsEvents(undefined, days)

    for (const event of events) {
      if (event.event !== 'llm_error') continue
      if (event.createdAt < from || event.createdAt > to) continue

      const classified = classifyAnalyticsError(event.payload)
      byCategory[classified.category] += 1
      bySeverity[classified.severity] += 1
      codeCounts.set(classified.code, (codeCounts.get(classified.code) || 0) + 1)
      total += 1
    }

    const topErrors = Array.from(codeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count }))

    const response: ErrorStatsResponse = {
      total,
      byCategory,
      bySeverity,
      topErrors,
    }

    return NextResponse.json(response, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Failed to load admin error stats:', error)
    return NextResponse.json(
      { error: 'Failed to load error statistics' },
      { status: 500 }
    )
  }
})
