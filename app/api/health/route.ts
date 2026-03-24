'use server'

import { NextRequest } from 'next/server'
import { metrics } from '@/lib/api-logger'
import { getCacheDiagnostics } from '@/lib/cache'
import prisma from '@/lib/prisma'
import { getErrorMessage, isDatabaseUnavailableError } from '@/lib/db-fallback'
import { getRateLimitDiagnostics } from '@/lib/rate-limit'
import { getReleaseMetadata } from '@/lib/release-metadata'
import { getSidecarDiagnostics } from '@/lib/sidecar-health'

// Health check API route — includes request metrics snapshot
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const release = getReleaseMetadata()
  const generatedAt = new Date().toISOString()
  const totalResponseTimeMs = Date.now() - startTime

  const includeMetrics = request.nextUrl.searchParams.get('metrics') === '1'

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
    cacheDiagnostics.status !== 'degraded' &&
    rateLimitDiagnostics.status !== 'degraded' &&
    sidecarDiagnostics.status !== 'degraded'
      ? 'healthy'
      : 'degraded'

  const degradedChecks = [
    databaseStatus !== 'connected' ? 'database' : null,
    cacheDiagnostics.status === 'degraded' ? 'cache' : null,
    rateLimitDiagnostics.status === 'degraded' ? 'rateLimit' : null,
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
        responseTime: databaseResponseTimeMs,
        responseTimeMs: databaseResponseTimeMs,
        ...(databaseMessage ? { message: databaseMessage } : {}),
      },
      cache: {
        status: cacheDiagnostics.status,
        responseTime: cacheResponseTimeMs,
        responseTimeMs: cacheResponseTimeMs,
        message: cacheDiagnostics.message,
        mode: cacheDiagnostics.mode,
      },
      rateLimit: {
        status: rateLimitDiagnostics.status,
        responseTime: rateLimitResponseTimeMs,
        responseTimeMs: rateLimitResponseTimeMs,
        message: rateLimitDiagnostics.message,
        mode: rateLimitDiagnostics.mode,
      },
      sidecar: {
        status: sidecarDiagnostics.status,
        responseTime: sidecarResponseTimeMs,
        responseTimeMs: sidecarResponseTimeMs,
        message: sidecarDiagnostics.message,
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
