'use server'

import { NextRequest } from 'next/server'
import { metrics } from '@/lib/api-logger'
import { getAuthenticatedAdmin } from '@/lib/api-auth'
import { getCacheDiagnostics } from '@/lib/cache'
import prisma from '@/lib/prisma'
import { getErrorMessage, isDatabaseUnavailableError } from '@/lib/db-fallback'
import { getRateLimitDiagnostics } from '@/lib/rate-limit'
import { getReleaseMetadata } from '@/lib/release-metadata'
import { getSidecarDiagnostics } from '@/lib/sidecar-health'

type CheckPayload = {
  status: string
  responseTime: number
  responseTimeMs: number
  message?: string
  mode?: string
}

// Health check API route — includes request metrics snapshot
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const release = getReleaseMetadata()
  const generatedAt = new Date().toISOString()
  const totalResponseTimeMs = Date.now() - startTime

  const includeMetrics = request.nextUrl.searchParams.get('metrics') === '1'

  let adminAuthCheck: Response | undefined
  let isPrivilegedView = false

  if (includeMetrics) {
    adminAuthCheck = await getAuthenticatedAdmin()
    isPrivilegedView = !(adminAuthCheck instanceof Response)
  }
  const dbStart = Date.now()
  let databaseStatus: 'connected' | 'degraded' = 'connected'
  let databaseMessage: string | undefined
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    databaseStatus = 'degraded'
    databaseMessage = isDatabaseUnavailableError(error)
      ? 'Database unavailable; running with in-memory fallback'
      : getErrorMessage(error) || 'Database health check failed'
  }

  const rateLimitStart = Date.now()
  const rateLimitDiagnostics = getRateLimitDiagnostics()
  const cacheStart = Date.now()
  const cacheDiagnostics = getCacheDiagnostics()

  const sidecarStart = Date.now()
  const sidecarDiagnostics = await getSidecarDiagnostics()
  const databaseResponseTimeMs = Date.now() - dbStart
  const cacheResponseTimeMs = Date.now() - cacheStart
  const rateLimitResponseTimeMs = Date.now() - rateLimitStart
  const sidecarResponseTimeMs = Date.now() - sidecarStart

  const status =
    databaseStatus === 'connected' &&
    !['degraded', 'error'].includes(cacheDiagnostics.status) &&
    !['degraded', 'error'].includes(rateLimitDiagnostics.status) &&
    sidecarDiagnostics.status !== 'degraded'
      ? 'healthy'
      : 'degraded'

  const degradedChecks = [
    databaseStatus !== 'connected' ? 'database' : null,
    ['degraded', 'error'].includes(cacheDiagnostics.status) ? 'cache' : null,
    ['degraded', 'error'].includes(rateLimitDiagnostics.status) ? 'rateLimit' : null,
    sidecarDiagnostics.status === 'degraded' ? 'sidecar' : null,
  ].filter((value): value is 'database' | 'cache' | 'rateLimit' | 'sidecar' =>
    value !== null
  )

  const alertLevel =
    databaseStatus !== 'connected'
      ? 'critical'
      : degradedChecks.length > 0
        ? 'warning'
        : 'none'

  const publicChecks = {
    database: {
      status: databaseStatus,
      responseTime: databaseResponseTimeMs,
      responseTimeMs: databaseResponseTimeMs,
    },
    cache: {
      status: cacheDiagnostics.status,
      responseTime: cacheResponseTimeMs,
      responseTimeMs: cacheResponseTimeMs,
    },
    rateLimit: {
      status: rateLimitDiagnostics.status,
      responseTime: rateLimitResponseTimeMs,
      responseTimeMs: rateLimitResponseTimeMs,
    },
    sidecar: {
      status: sidecarDiagnostics.status,
      responseTime: sidecarResponseTimeMs,
      responseTimeMs: sidecarResponseTimeMs,
    },
    api: {
      status: 'responsive',
      responseTime: totalResponseTimeMs,
      responseTimeMs: totalResponseTimeMs,
    },
  } satisfies Record<string, CheckPayload>

  const detailedChecks = {
    ...publicChecks,
    database: {
      ...publicChecks.database,
      ...(databaseMessage ? { message: databaseMessage } : {}),
    },
    cache: {
      ...publicChecks.cache,
      message: cacheDiagnostics.message,
      mode: cacheDiagnostics.mode,
    },
    rateLimit: {
      ...publicChecks.rateLimit,
      message: rateLimitDiagnostics.message,
      mode: rateLimitDiagnostics.mode,
    },
    sidecar: {
      ...publicChecks.sidecar,
      message: sidecarDiagnostics.message,
    },
  }

  const healthChecks = {
    source: 'health',
    visibility: isPrivilegedView ? 'admin' : 'public',
    status,
    generatedAt,
    timestamp: generatedAt,
    uptime: process.uptime(),
    responseTime: totalResponseTimeMs,
    responseTimeMs: totalResponseTimeMs,
    summary: {
      coreAvailability: databaseStatus === 'connected' ? 'available' : 'degraded',
      degradedChecks,
      alertLevel,
      shouldPage: alertLevel === 'critical',
    },
    checks: isPrivilegedView ? detailedChecks : publicChecks,
    ...(isPrivilegedView
      ? {
          version: release.version,
          release,
          environment: process.env.NODE_ENV || 'development',
          ...(includeMetrics ? { metrics: metrics.snapshot() } : {}),
        }
      : {}),
  }

  return new Response(JSON.stringify(healthChecks, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
