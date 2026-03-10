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

  const status =
    databaseStatus === 'connected' &&
    cacheDiagnostics.status !== 'degraded' &&
    rateLimitDiagnostics.status !== 'degraded' &&
    sidecarDiagnostics.status !== 'degraded'
      ? 'healthy'
      : 'degraded'

  const healthChecks = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    version: release.version,
    release,
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: {
        status: databaseStatus,
        responseTime: Date.now() - dbStart,
        ...(databaseMessage ? { message: databaseMessage } : {}),
      },
      cache: {
        status: cacheDiagnostics.status,
        responseTime: Date.now() - cacheStart,
        message: cacheDiagnostics.message,
        mode: cacheDiagnostics.mode,
      },
      rateLimit: {
        status: rateLimitDiagnostics.status,
        responseTime: Date.now() - rateLimitStart,
        message: rateLimitDiagnostics.message,
        mode: rateLimitDiagnostics.mode,
      },
      sidecar: {
        status: sidecarDiagnostics.status,
        responseTime: Date.now() - sidecarStart,
        message: sidecarDiagnostics.message,
      },
      api: { status: 'responsive', responseTime: Date.now() - startTime },
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
