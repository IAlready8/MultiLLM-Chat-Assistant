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
      console.warn(
        'Invalid NEXTAUTH_URL; falling back to http://localhost:3000',
      )
    }
  }
  return new URL('http://localhost:3000')
}

const ongoingSubscriptionStatuses = new Set([
  'active',
  'incomplete',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
])

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

    const stripeCustomerId = await getOrCreateStripeCustomer(
      user.id,
      user.email,
    )

    const baseUrl = getBaseUrl()

    const existingSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 100,
    })
    const hasOngoingSubscription = existingSubscriptions.data.some(
      (subscription) => ongoingSubscriptionStatuses.has(subscription.status),
    )

    if (hasOngoingSubscription) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: new URL('/billing', baseUrl).toString(),
      })

      return NextResponse.json({
        url: portalSession.url,
        destination: 'portal',
      })
    }

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [
        {
          price: STRIPE_PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      subscription_data: {
        billing_mode: { type: 'flexible' },
        metadata: {
          app: 'multi-llm-chat-assistant',
          tier: 'PRO',
          userId: user.id,
        },
      },
      success_url: new URL('/billing?success=true', baseUrl).toString(),
      cancel_url: new URL('/billing?canceled=true', baseUrl).toString(),
      metadata: {
        app: 'multi-llm-chat-assistant',
        tier: 'PRO',
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

    return NextResponse.json({ url: session.url, destination: 'checkout' })
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      logger.warn('stripe_checkout_unavailable', {
        route: '/api/subscriptions',
        userId: user.id,
        reason: error.message,
      })
      return NextResponse.json(
        { error: getStripeConfigurationUserMessage('checkout') },
        { status: 503 },
      )
    }
    logger.error('stripe_checkout_failed', {
      route: '/api/subscriptions',
      userId: user.id,
      error,
    })
    return NextResponse.json(
      { error: 'Failed to create subscription session' },
      { status: 500 },
    )
  }
}
