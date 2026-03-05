import { sanitizeLogValue } from '@/lib/log-sanitizer'

/**
 * Structured API logger for server-side route handlers.
 *
 * Emits JSON-structured log lines for observability, covering:
 * - Request lifecycle (method, path, status, duration)
 * - Error classification (validation, auth, upstream, internal)
 * - Basic request metrics (in-memory counters for /api/health)
 */

type LogLevel = 'info' | 'warn' | 'error'

type LogEntry = {
  ts: string
  level: LogLevel
  method: string
  path: string
  status: number
  durationMs: number
  userId?: string
  error?: string
  errorType?: 'validation' | 'auth' | 'upstream' | 'internal'
  meta?: Record<string, unknown>
}

const emit = (entry: LogEntry) => {
  const line = JSON.stringify(sanitizeLogValue(entry))
  if (entry.level === 'error') {
    console.error(line)
  } else if (entry.level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

const levelForStatus = (status: number): LogLevel => {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

const classifyError = (
  status: number
): LogEntry['errorType'] | undefined => {
  if (status === 400 || status === 422) return 'validation'
  if (status === 401 || status === 403) return 'auth'
  if (status === 502 || status === 503 || status === 504) return 'upstream'
  if (status >= 500) return 'internal'
  return undefined
}

export const apiLog = {
  /**
   * Log a completed API request.
   */
  request(opts: {
    method: string
    path: string
    status: number
    durationMs: number
    userId?: string
    error?: string
    meta?: Record<string, unknown>
  }) {
    const errorType = classifyError(opts.status)
    emit({
      ts: new Date().toISOString(),
      level: levelForStatus(opts.status),
      method: opts.method,
      path: opts.path,
      status: opts.status,
      durationMs: opts.durationMs,
      userId: opts.userId,
      error: opts.error,
      errorType,
      meta: opts.meta,
    })
    metrics.record(opts.method, opts.path, opts.status, opts.durationMs)
  },
}

// ---------------------------------------------------------------------------
// In-memory request metrics (exposed via /api/health for lightweight monitoring)
// ---------------------------------------------------------------------------

type MetricsBucket = {
  total: number
  errors: number
  totalDurationMs: number
  byStatus: Map<number, number>
}

const createBucket = (): MetricsBucket => ({
  total: 0,
  errors: 0,
  totalDurationMs: 0,
  byStatus: new Map(),
})

type GlobalMetricsStore = typeof globalThis & {
  __multiLlmApiMetrics?: {
    buckets: Map<string, MetricsBucket>
    startedAt: string
  }
}

const metricsGlobal = globalThis as GlobalMetricsStore
const store =
  metricsGlobal.__multiLlmApiMetrics ??
  (metricsGlobal.__multiLlmApiMetrics = {
    buckets: new Map(),
    startedAt: new Date().toISOString(),
  })

export const metrics = {
  record(method: string, path: string, status: number, durationMs: number) {
    // Normalize path: strip dynamic segments for grouping
    const normalized = path.replace(/\/[a-z0-9]{20,}/gi, '/:id')
    const key = `${method} ${normalized}`
    const bucket = store.buckets.get(key) ?? createBucket()
    bucket.total += 1
    bucket.totalDurationMs += durationMs
    if (status >= 500) {
      bucket.errors += 1
    }
    bucket.byStatus.set(status, (bucket.byStatus.get(status) ?? 0) + 1)
    store.buckets.set(key, bucket)
  },

  /** Return a snapshot suitable for JSON serialization. */
  snapshot() {
    const routes: Record<
      string,
      {
        total: number
        errors: number
        avgMs: number
        statusCodes: Record<string, number>
      }
    > = {}

    for (const [key, bucket] of store.buckets) {
      routes[key] = {
        total: bucket.total,
        errors: bucket.errors,
        avgMs: bucket.total > 0 ? Math.round(bucket.totalDurationMs / bucket.total) : 0,
        statusCodes: Object.fromEntries(bucket.byStatus),
      }
    }

    return {
      startedAt: store.startedAt,
      routes,
    }
  },
}
