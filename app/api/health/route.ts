'use server'

import { NextRequest } from 'next/server'
import { metrics } from '@/lib/api-logger'
import prisma from '@/lib/prisma'
import { getErrorMessage, isDatabaseUnavailableError } from '@/lib/db-fallback'
import { getRateLimitDiagnostics } from '@/lib/rate-limit'
import { getReleaseMetadata } from '@/lib/release-metadata'

const sidecarHealthUrl = () => {
  const baseUrl = process.env.PYTHON_CORE_URL?.trim()
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/v1/health` : null
}

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
  const cacheStatus = rateLimitDiagnostics.status
  const cacheMessage = rateLimitDiagnostics.message

  const sidecarUrl = sidecarHealthUrl()
  const sidecarStart = Date.now()
  let sidecarStatus: 'connected' | 'degraded' | 'disabled' = 'disabled'
  let sidecarMessage = 'Python sidecar not configured'

  if (sidecarUrl) {
    try {
      const response = await fetch(sidecarUrl, {
        signal: AbortSignal.timeout(2000),
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      const payloadStatus = String(payload?.status || '').toLowerCase()

      if (
        response.ok &&
        (payloadStatus === 'ok' ||
          payloadStatus === 'healthy' ||
          payloadStatus === 'degraded')
      ) {
        sidecarStatus = payloadStatus === 'degraded' ? 'degraded' : 'connected'
        sidecarMessage =
          sidecarStatus === 'connected'
            ? `Python sidecar responding (${payload.status})`
            : `Python sidecar reported degraded status (${payload.status})`
      } else {
        sidecarStatus = 'degraded'
        sidecarMessage = `Python sidecar health check failed (${response.status})`
      }
    } catch (error) {
      sidecarStatus = 'degraded'
      sidecarMessage = getErrorMessage(error) || 'Python sidecar health check failed'
    }
  }

  const status =
    databaseStatus === 'connected' &&
    cacheStatus !== 'degraded' &&
    sidecarStatus !== 'degraded'
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
        status: cacheStatus,
        responseTime: Date.now() - rateLimitStart,
        message: cacheMessage,
        mode: rateLimitDiagnostics.mode,
      },
      sidecar: {
        status: sidecarStatus,
        responseTime: Date.now() - sidecarStart,
        message: sidecarMessage,
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
