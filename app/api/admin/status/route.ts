import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'
import { getAuthenticatedAdmin } from '@/lib/api-auth'
import {
  getErrorMessage,
  isDatabaseUnavailableError,
} from '@/lib/db-fallback'
import { getRateLimitDiagnostics } from '@/lib/rate-limit'
import { isStrictAuthRequired } from '@/lib/demo-account'
import {
  isStripeApiConfigured,
  isStripeCheckoutConfigured,
  isStripeWebhookConfigured,
} from '@/lib/stripe'
import { getReleaseMetadata, type ReleaseMetadata } from '@/lib/release-metadata'

type CheckStatus = 'ok' | 'warning' | 'error'

type SystemCheck = {
  id: string
  name: string
  description: string
  status: CheckStatus
  message: string
  responseTimeMs: number
}

type SystemStatusResponse = {
  generatedAt: string
  overallStatus: CheckStatus
  version: string
  release: ReleaseMetadata
  checks: SystemCheck[]
  systemInfo: {
    app: string
    environment: string
    nodeVersion: string
    strictAuth: boolean
    databaseUrlConfigured: boolean
    stripe: {
      apiConfigured: boolean
      checkoutConfigured: boolean
      webhookConfigured: boolean
    }
    rateLimit: {
      mode: 'redis' | 'memory'
      redisConfigured: boolean
      redisConnected: boolean
      inMemoryKeys: number
    }
  }
}

const createCheck = (
  id: string,
  name: string,
  description: string,
  status: CheckStatus,
  message: string,
  responseTimeMs: number
): SystemCheck => ({
  id,
  name,
  description,
  status,
  message,
  responseTimeMs,
})

const getOverallStatus = (checks: SystemCheck[]): CheckStatus => {
  if (checks.some((check) => check.status === 'error')) {
    return 'error'
  }
  if (checks.some((check) => check.status === 'warning')) {
    return 'warning'
  }
  return 'ok'
}

export const GET = withApiMetrics(async () => {
  const authCheck = await getAuthenticatedAdmin()
  if (authCheck instanceof NextResponse) {
    return authCheck
  }

  const release = getReleaseMetadata()
  const strictAuth = isStrictAuthRequired()
  const hasNextAuthSecret = Boolean(process.env.NEXTAUTH_SECRET?.trim())
  const hasNextAuthUrl = Boolean(process.env.NEXTAUTH_URL?.trim())
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim())
  const hasApiSeed = Boolean(process.env.API_KEY_ENCRYPTION_SEED?.trim())
  const isProduction = process.env.NODE_ENV === 'production'

  const checks: SystemCheck[] = []

  checks.push(
    createCheck(
      'api',
      'API Server',
      'Check API server responsiveness',
      'ok',
      'API server is responding normally',
      1
    )
  )

  const dbStart = Date.now()
  let databaseStatus: CheckStatus = 'ok'
  let databaseMessage = 'Database connection established'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    databaseStatus = isDatabaseUnavailableError(error) ? 'warning' : 'error'
    databaseMessage = isDatabaseUnavailableError(error)
      ? 'Database unavailable; running with in-memory fallback'
      : getErrorMessage(error) || 'Database health check failed'
  }
  checks.push(
    createCheck(
      'database',
      'Database',
      'Verify database connectivity and query execution',
      databaseStatus,
      databaseMessage,
      Date.now() - dbStart
    )
  )

  const authStart = Date.now()
  let authStatus: CheckStatus = 'ok'
  let authMessage = strictAuth
    ? 'Strict authentication mode is enabled and configured'
    : 'Authentication is operational (guest mode supported)'

  if (strictAuth && !hasNextAuthSecret) {
    authStatus = 'error'
    authMessage = 'Strict auth is enabled but NEXTAUTH_SECRET is missing'
  } else if (!hasNextAuthSecret) {
    authStatus = 'warning'
    authMessage = 'NEXTAUTH_SECRET is missing; non-strict mode fallback is active'
  } else if (!hasNextAuthUrl) {
    authStatus = 'warning'
    authMessage = 'NEXTAUTH_URL is missing; callbacks may fail in non-local environments'
  }

  checks.push(
    createCheck(
      'auth',
      'Authentication',
      'Validate auth/session configuration',
      authStatus,
      authMessage,
      Date.now() - authStart
    )
  )

  const storageStart = Date.now()
  let storageStatus: CheckStatus = 'ok'
  let storageMessage = 'Persistent storage is configured and available'

  if (!hasDatabaseUrl) {
    storageStatus = 'warning'
    storageMessage = 'DATABASE_URL is not set; persistence relies on in-memory fallback'
  } else if (databaseStatus !== 'ok') {
    storageStatus = 'warning'
    storageMessage = 'Database is configured but currently unavailable; using in-memory fallback'
  }

  checks.push(
    createCheck(
      'storage',
      'Storage',
      'Verify persistent storage behavior',
      storageStatus,
      storageMessage,
      Date.now() - storageStart
    )
  )

  const rateLimitStart = Date.now()
  const rateLimitDiagnostics = getRateLimitDiagnostics()
  const rateLimitStatus: CheckStatus =
    rateLimitDiagnostics.status === 'connected' ? 'ok' : 'warning'
  const rateLimitMessage = rateLimitDiagnostics.message

  checks.push(
    createCheck(
      'rate-limit',
      'Rate Limiting',
      'Check request throttling backend and state',
      rateLimitStatus,
      rateLimitMessage,
      Date.now() - rateLimitStart
    )
  )

  const securityStart = Date.now()
  let securityStatus: CheckStatus = 'ok'
  let securityMessage = 'Core runtime secrets are configured'

  if (isProduction && (!hasApiSeed || !hasNextAuthSecret)) {
    securityStatus = 'error'
    securityMessage =
      'Production secrets are incomplete (NEXTAUTH_SECRET and API_KEY_ENCRYPTION_SEED are required)'
  } else if (!hasApiSeed) {
    securityStatus = 'warning'
    securityMessage =
      'API_KEY_ENCRYPTION_SEED is missing; development fallback seed is in use'
  } else if (!isStripeApiConfigured) {
    securityStatus = 'warning'
    securityMessage = 'Billing secrets are not fully configured (Stripe API disabled)'
  }

  checks.push(
    createCheck(
      'security',
      'Security',
      'Validate runtime secret and billing-security configuration',
      securityStatus,
      securityMessage,
      Date.now() - securityStart
    )
  )

  const response: SystemStatusResponse = {
    generatedAt: new Date().toISOString(),
    overallStatus: getOverallStatus(checks),
    version: release.version,
    release,
    checks,
    systemInfo: {
      app: 'Multi-LLM Chat Assistant',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      strictAuth,
      databaseUrlConfigured: hasDatabaseUrl,
      stripe: {
        apiConfigured: isStripeApiConfigured,
        checkoutConfigured: isStripeCheckoutConfigured,
        webhookConfigured: isStripeWebhookConfigured,
      },
      rateLimit: rateLimitDiagnostics,
    },
  }

  return NextResponse.json(response, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
})
