import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  stripe,
  getOrCreateStripeCustomer,
  STRIPE_PRO_PRICE_ID,
  StripeConfigurationError,
  ensureStripeConfigured,
  getStripeConfigurationUserMessage,
} from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import { readBillingSource } from '@/lib/billing-source'

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
 * POST /api/subscriptions
 * Creates a new Stripe Checkout session for a user to subscribe.
 */
export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck
  const source = await readBillingSource(req)

  if (!user.email) {
    return NextResponse.json({ error: 'User email not found' }, { status: 400 })
  }

  try {
    ensureStripeConfigured('checkout')

    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email)

    const baseUrl = getBaseUrl()

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: STRIPE_PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl.href}billing?success=true`,
      cancel_url: `${baseUrl.href}billing?canceled=true`,
      metadata: {
        userId: user.id,
      },
    })

    try {
      await recordAnalyticsEvent({
        event: 'billing_checkout_session_created',
        userId: user.id,
        payload: { source, tier: 'PRO' },
      })
    } catch (analyticsError) {
      logger.warn('billing_checkout_analytics_failed', {
        route: '/api/subscriptions',
        userId: user.id,
        source,
        error: analyticsError,
      })
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      logger.warn('stripe_checkout_unavailable', {
        route: '/api/subscriptions',
        userId: user.id,
        reason: error.message,
      })
      return NextResponse.json(
        { error: getStripeConfigurationUserMessage('checkout') },
        { status: 503 }
      )
    }
    logger.error('stripe_checkout_failed', {
      route: '/api/subscriptions',
      userId: user.id,
      error,
    })
    return NextResponse.json(
      { error: 'Failed to create subscription session' },
      { status: 500 }
    )
  }
}
