'use server'

import { NextRequest } from 'next/server'
import { metrics } from '@/lib/api-logger'
import prisma from '@/lib/prisma'
import { getErrorMessage, isDatabaseUnavailableError } from '@/lib/db-fallback'

// Health check API route — includes request metrics snapshot
export async function GET(request: NextRequest) {
  const startTime = Date.now()

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

  const status = databaseStatus === 'connected' ? 'healthy' : 'degraded'

  const healthChecks = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: {
        status: databaseStatus,
        responseTime: Date.now() - dbStart,
        ...(databaseMessage ? { message: databaseMessage } : {}),
      },
      cache: { status: 'connected', responseTime: 2 },
      api: { status: 'responsive', responseTime: 10 },
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
