import { NextResponse } from 'next/server'
import { apiLog } from '@/lib/api-logger'

export type MetricsRouteContext = {
  params: Promise<Record<string, string | string[] | undefined>>
}

type RouteHandler = (
  req: Request,
  ctx: MetricsRouteContext
) => Promise<Response | NextResponse>

/**
 * Wraps a Next.js API route handler with structured logging and timing.
 *
 * Usage:
 *   export const GET = withApiMetrics(async (req) => { ... })
 */
export function withApiMetrics(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const start = performance.now()
    const url = new URL(req.url)
    const method = req.method
    const path = url.pathname

    try {
      const response = await handler(req, ctx)
      const durationMs = Math.round(performance.now() - start)
      const status = response.status

      apiLog.request({
        method,
        path,
        status,
        durationMs,
      })

      return response
    } catch (error) {
      const durationMs = Math.round(performance.now() - start)
      const message = error instanceof Error ? error.message : 'Unknown error'

      apiLog.request({
        method,
        path,
        status: 500,
        durationMs,
        error: message,
      })

      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}
