import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { stripe, getOrCreateStripeCustomer } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

// Get the absolute URL for Stripe callbacks
const getBaseUrl = () => new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000')

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
  } catch (error: any) {
    console.error('Error creating customer portal session:', error)
    return NextResponse.json(
      { error: `Failed to create portal session: ${error.message}` },
      { status: 500 }
    )
  }
}