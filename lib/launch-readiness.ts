/**
 * Operator-facing launch checks: configuration that the app can run without,
 * but that a public, paid release should not ship without. Reported on the
 * admin status page. Never blocks startup and never exposes secret values.
 */

export type LaunchFinding = {
  id: string
  severity: 'warning' | 'error'
  message: string
}

export type LaunchReadiness = {
  status: 'ok' | 'warning' | 'error'
  findings: LaunchFinding[]
}

type Env = Record<string, string | undefined>

const has = (value: string | undefined): boolean => Boolean(value?.trim())

const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

type Limits = { FREE: number | null; PRO: number | null; ENTERPRISE: number | null }

const parseLimits = (raw: string): Limits | null => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const keys = Object.keys(parsed).sort().join(',')
    if (keys !== 'ENTERPRISE,FREE,PRO') return null
    for (const value of Object.values(parsed)) {
      if (value === null) continue
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
    }
    return parsed as Limits
  } catch {
    return null
  }
}

export const getLaunchReadiness = (env: Env = process.env): LaunchReadiness => {
  const findings: LaunchFinding[] = []

  const checkoutEnabled =
    has(env.STRIPE_SECRET_KEY) && has(env.STRIPE_PRO_PRICE_ID)
  const rawLimits = env.LLM_MONTHLY_REQUEST_LIMITS?.trim()

  if (rawLimits) {
    const limits = parseLimits(rawLimits)
    if (!limits) {
      findings.push({
        id: 'plan-limits-invalid',
        severity: 'error',
        message:
          'LLM_MONTHLY_REQUEST_LIMITS is not valid. Generation requests are refused until it is fixed or removed.',
      })
    } else if (checkoutEnabled) {
      const proIsBetter =
        limits.FREE !== null && (limits.PRO === null || limits.PRO > limits.FREE)
      if (!proIsBetter) {
        findings.push({
          id: 'pro-not-better-than-free',
          severity: 'warning',
          message:
            'Pro does not allow more monthly generations than Free, so the paid plan sells no extra allowance.',
        })
      }
    }
  } else if (checkoutEnabled) {
    findings.push({
      id: 'paid-plan-without-limits',
      severity: 'warning',
      message:
        'Checkout is enabled but LLM_MONTHLY_REQUEST_LIMITS is not set. Free and Pro accounts currently get identical access.',
    })
  }

  if (checkoutEnabled && !has(env.STRIPE_WEBHOOK_SECRET)) {
    findings.push({
      id: 'checkout-without-webhook',
      severity: 'error',
      message:
        'Checkout is enabled without STRIPE_WEBHOOK_SECRET. Payments would succeed but accounts would never be upgraded.',
    })
  }

  const supportEmail = env.SUPPORT_EMAIL?.trim()
  if (!supportEmail || !EMAIL_PATTERN.test(supportEmail)) {
    findings.push({
      id: 'no-contact-address',
      severity: 'warning',
      message:
        'SUPPORT_EMAIL is not set to a valid address. The Terms and Privacy pages show no way to contact you.',
    })
  }

  if (!has(env.LEGAL_ENTITY_NAME)) {
    findings.push({
      id: 'no-operator-name',
      severity: 'warning',
      message:
        'LEGAL_ENTITY_NAME is not set. The Terms and Privacy pages do not name who operates the service.',
    })
  }

  const google = has(env.GOOGLE_CLIENT_ID) && has(env.GOOGLE_CLIENT_SECRET)
  const github = has(env.GITHUB_CLIENT_ID) && has(env.GITHUB_CLIENT_SECRET)
  if (!google && !github) {
    findings.push({
      id: 'no-signup-provider',
      severity: 'warning',
      message:
        'No Google or GitHub sign-in provider is configured, so new users cannot create accounts.',
    })
  }

  const status = findings.some((finding) => finding.severity === 'error')
    ? 'error'
    : findings.length > 0
      ? 'warning'
      : 'ok'

  return { status, findings }
}
