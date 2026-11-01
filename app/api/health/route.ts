import { NextRequest } from 'next/server'
import { metrics } from '@/lib/api-logger'
import { getCacheDiagnostics } from '@/lib/cache'
import prisma from '@/lib/prisma'
import { getRateLimitDiagnostics, probeRateLimitBackend } from '@/lib/rate-limit'
import { getReleaseMetadata } from '@/lib/release-metadata'
import { getSidecarDiagnostics } from '@/lib/sidecar-health'
import { providerRegistry, isProviderOperational } from '@/lib/provider-registry'

// Upper bound for the database probe. A hung connection or query must surface
// as a degraded check instead of holding the health endpoint open until the
// platform function timeout. Generous enough for a serverless Postgres cold start.
// Not exported: Next.js route modules may only export handlers and segment config.
const DATABASE_PROBE_TIMEOUT_MS = 5_000

class ProbeTimeoutError extends Error {
  constructor() {
    super('Health probe timed out')
    this.name = 'ProbeTimeoutError'
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProbeTimeoutError()), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function timed<T>(run: () => Promise<T> | T): Promise<{ value: T; durationMs: number }> {
  const startedAt = Date.now()
  const value = await run()
  return { value, durationMs: Date.now() - startedAt }
}

type SchemaState = 'current' | 'behind' | 'unchecked'

// Postgres SQLSTATE codes for a missing column (42703) or table (42P01).
const MISSING_SCHEMA_PATTERN = /\b(42703|42P01)\b|does not exist/i

function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; meta?: { code?: unknown; message?: unknown } }
  return [candidate.code, candidate.message, candidate.meta?.code, candidate.meta?.message]
    .some((value) => typeof value === 'string' && MISSING_SCHEMA_PATTERN.test(value))
}

async function probeDatabase(): Promise<{
  status: 'connected' | 'degraded'
  schema: SchemaState
  message?: string
}> {
  const progress: { stage: 'connect' | 'schema' } = { stage: 'connect' }
  try {
    await withTimeout(
      (async () => {
        await prisma.$queryRaw`SELECT 1`
        progress.stage = 'schema'
        // Zero-row read of columns that every authenticated request depends on.
        // It fails only when a required migration has not been applied.
        await prisma.$queryRaw`SELECT "role", "passwordVersion" FROM "User" LIMIT 0`
      })(),
      DATABASE_PROBE_TIMEOUT_MS,
    )
    return { status: 'connected', schema: 'current' }
  } catch (error) {
    if (error instanceof ProbeTimeoutError) {
      return { status: 'degraded', schema: 'unchecked', message: 'Database health check timed out' }
    }
    if (progress.stage === 'schema') {
      return isMissingSchemaError(error)
        ? {
            status: 'degraded',
            schema: 'behind',
            message: 'Database schema is behind this release; apply pending migrations',
          }
        : { status: 'degraded', schema: 'unchecked', message: 'Database schema check failed' }
    }
    return { status: 'degraded', schema: 'unchecked', message: 'Database health check failed' }
  }
}

// Health check API route. Each dependency check reports its own duration;
// the top-level response time covers the whole request.
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const release = getReleaseMetadata()
  const generatedAt = new Date().toISOString()

  const includeMetrics = request.nextUrl.searchParams.get('metrics') === '1'

  // Independent dependency probes run concurrently so one slow dependency
  // does not inflate the others' timings or the total response time.
  const [database, rateLimit, sidecar] = await Promise.all([
    timed(probeDatabase),
    timed(async () => {
      await probeRateLimitBackend()
      return getRateLimitDiagnostics()
    }),
    timed(() => getSidecarDiagnostics()),
  ])
  const cache = await timed(() => getCacheDiagnostics())
  const providers = await timed(() =>
    providerRegistry.filter((p) => isProviderOperational(p.id)),
  )

  const databaseStatus = database.value.status
  const databaseSchema = database.value.schema
  const databaseMessage = database.value.message
  const rateLimitDiagnostics = rateLimit.value
  const sidecarDiagnostics = sidecar.value
  const cacheDiagnostics = cache.value
  const operationalProviders = providers.value
  const providerDiagnostics = {
    status: operationalProviders.length > 0 ? 'ok' : 'degraded',
    responseTimeMs: providers.durationMs,
    message: `${operationalProviders.length} of ${providerRegistry.length} providers operational`,
    providers: operationalProviders.map((p) => ({
      id: p.id,
      name: p.name,
      requiresApiKey: p.requiresApiKey,
    })),
  }

  const status =
    databaseStatus === 'connected' &&
    cacheDiagnostics.status !== 'degraded' &&
    rateLimitDiagnostics.status !== 'degraded' &&
    sidecarDiagnostics.status !== 'degraded' &&
    providerDiagnostics.status !== 'degraded'
      ? 'healthy'
      : 'degraded'

  const degradedChecks = [
    databaseStatus !== 'connected' ? 'database' : null,
    cacheDiagnostics.status === 'degraded' ? 'cache' : null,
    rateLimitDiagnostics.status === 'degraded' ? 'rateLimit' : null,
    sidecarDiagnostics.status === 'degraded' ? 'sidecar' : null,
    providerDiagnostics.status === 'degraded' ? 'providers' : null,
  ].filter((value): value is 'database' | 'cache' | 'rateLimit' | 'sidecar' | 'providers' =>
    value !== null
  )

  const alertLevel =
    databaseStatus !== 'connected'
      ? 'critical'
      : degradedChecks.length > 0
        ? 'warning'
        : 'none'

  const totalResponseTimeMs = Date.now() - startTime

  const healthChecks = {
    source: 'health',
    status,
    generatedAt,
    timestamp: generatedAt,
    uptime: process.uptime(),
    responseTime: totalResponseTimeMs,
    responseTimeMs: totalResponseTimeMs,
    version: release.version,
    release,
    environment: process.env.NODE_ENV || 'development',
    summary: {
      coreAvailability: databaseStatus === 'connected' ? 'available' : 'degraded',
      degradedChecks,
      alertLevel,
      shouldPage: alertLevel === 'critical',
    },
    checks: {
      database: {
        status: databaseStatus,
        schema: databaseSchema,
        responseTime: database.durationMs,
        responseTimeMs: database.durationMs,
        ...(databaseMessage ? { message: databaseMessage } : {}),
      },
      cache: {
        status: cacheDiagnostics.status,
        responseTime: cache.durationMs,
        responseTimeMs: cache.durationMs,
        message: cacheDiagnostics.message,
        mode: cacheDiagnostics.mode,
      },
      rateLimit: {
        status: rateLimitDiagnostics.status,
        responseTime: rateLimit.durationMs,
        responseTimeMs: rateLimit.durationMs,
        scope: rateLimitDiagnostics.scope,
        message: rateLimitDiagnostics.message,
        mode: rateLimitDiagnostics.mode,
      },
      sidecar: {
        status: sidecarDiagnostics.status,
        responseTime: sidecar.durationMs,
        responseTimeMs: sidecar.durationMs,
        message: sidecarDiagnostics.message,
      },
      providers: {
        status: providerDiagnostics.status,
        responseTime: providerDiagnostics.responseTimeMs,
        responseTimeMs: providerDiagnostics.responseTimeMs,
        message: providerDiagnostics.message,
        providers: providerDiagnostics.providers,
      },
      api: {
        status: 'responsive',
        responseTime: totalResponseTimeMs,
        responseTimeMs: totalResponseTimeMs,
      },
    },
    ...(includeMetrics ? { metrics: metrics.snapshot() } : {}),
  }

  return new Response(JSON.stringify(healthChecks, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
