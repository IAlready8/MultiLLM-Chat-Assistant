const isNonEmpty = (value: string | undefined): boolean =>
  Boolean(value && value.trim().length > 0)

let startupValidated = false

const validatePairedVars = (
  issues: string[],
  label: string,
  firstName: string,
  firstValue: string | undefined,
  secondName: string,
  secondValue: string | undefined
) => {
  const hasFirst = isNonEmpty(firstValue)
  const hasSecond = isNonEmpty(secondValue)
  if (hasFirst !== hasSecond) {
    issues.push(`${label} requires both ${firstName} and ${secondName}.`)
  }
}

export const validateStartupEnvironment = (): void => {
  if (startupValidated) {
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    startupValidated = true
    return
  }

  const issues: string[] = []

  if (!isNonEmpty(process.env.DATABASE_URL)) {
    issues.push('DATABASE_URL is required in production.')
  }

  if (!isNonEmpty(process.env.NEXTAUTH_SECRET) && !isNonEmpty(process.env.AUTH_SECRET)) {
    issues.push('NEXTAUTH_SECRET (or AUTH_SECRET) is required in production.')
  }

  if (!isNonEmpty(process.env.NEXTAUTH_URL)) {
    issues.push('NEXTAUTH_URL is required in production.')
  }

  if (!isNonEmpty(process.env.API_KEY_ENCRYPTION_SEED)) {
    issues.push('API_KEY_ENCRYPTION_SEED is required in production.')
  }

  if (!isNonEmpty(process.env.REDIS_URL)) {
    issues.push('REDIS_URL is required in production for rate limiting and cache safety.')
  }

  validatePairedVars(
    issues,
    'Google OAuth',
    'GOOGLE_CLIENT_ID',
    process.env.GOOGLE_CLIENT_ID,
    'GOOGLE_CLIENT_SECRET',
    process.env.GOOGLE_CLIENT_SECRET
  )
  validatePairedVars(
    issues,
    'GitHub OAuth',
    'GITHUB_CLIENT_ID',
    process.env.GITHUB_CLIENT_ID,
    'GITHUB_CLIENT_SECRET',
    process.env.GITHUB_CLIENT_SECRET
  )

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  const stripePrice = process.env.STRIPE_PRO_PRICE_ID
  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET
  const hasAnyStripeConfig =
    isNonEmpty(stripeSecret) || isNonEmpty(stripePrice) || isNonEmpty(stripeWebhook)

  if (hasAnyStripeConfig) {
    if (!isNonEmpty(stripeSecret) || !isNonEmpty(stripePrice) || !isNonEmpty(stripeWebhook)) {
      issues.push(
        'Stripe billing requires STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, and STRIPE_WEBHOOK_SECRET together when enabled.'
      )
    }
  }

  if (issues.length > 0) {
    const message = ['Startup environment validation failed:', ...issues.map((x) => `- ${x}`)]
      .join('\n')
    throw new Error(message)
  }

  startupValidated = true
}

export const __resetStartupValidationForTests = (): void => {
  startupValidated = false
}
