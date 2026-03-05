import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  stripe,
  getOrCreateStripeCustomer,
  StripeConfigurationError,
  ensureStripeConfigured,
  getStripeConfigurationUserMessage,
} from '@/lib/stripe'
import { logger } from '@/lib/logger'

// Get the absolute URL for Stripe callbacks
const getBaseUrl = () => {
  const configured = process.env.NEXTAUTH_URL?.trim()
  if (configured) {
    try {
      return new URL(configured)
    } catch {
      console.warn('Invalid NEXTAUTH_URL; falling back to http://localhost:3000')
    }
  }
  return new URL('http://localhost:3000')
}

/**
 * POST /api/subscriptions/manage
 * Creates a Stripe Customer Portal session for a user to manage their subscription.
 */
export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  if (!user.email) {
    return NextResponse.json({ error: 'User email not found' }, { status: 400 })
  }

  try {
    ensureStripeConfigured('api')

    // Get the Stripe Customer ID
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email)
    const baseUrl = getBaseUrl()

    // Create a Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${baseUrl.href}billing`,
    })

    // Return the session URL for client-side redirect
    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      logger.warn('stripe_portal_unavailable', {
        route: '/api/subscriptions/manage',
        userId: user.id,
        reason: error.message,
      })
      return NextResponse.json(
        { error: getStripeConfigurationUserMessage('api') },
        { status: 503 }
      )
    }
    logger.error('stripe_portal_failed', {
      route: '/api/subscriptions/manage',
      userId: user.id,
      error,
    })
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
