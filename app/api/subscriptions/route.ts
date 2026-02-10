import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  stripe,
  getOrCreateStripeCustomer,
  STRIPE_PRO_PRICE_ID,
  StripeConfigurationError,
  ensureStripeConfigured,
} from '@/lib/stripe'

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

    // Return the session URL for client-side redirect
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Error creating Stripe session:', error)
    if (error instanceof StripeConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    return NextResponse.json(
      { error: 'Failed to create subscription session' },
      { status: 500 }
    )
  }
}
