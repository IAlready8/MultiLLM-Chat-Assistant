import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import {
  stripe,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRO_PRICE_ID,
  ensureStripeConfigured,
  StripeConfigurationError,
} from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

/**
 * This is the critical webhook that Stripe calls to update our database.
 * It must be publicly accessible and handles various Stripe events.
 */
export async function POST(req: Request) {
  const body = await req.text()
  const headerStore = await headers()
  const signature = headerStore.get('Stripe-Signature')

  let event: Stripe.Event

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  try {
    ensureStripeConfigured('webhook')
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      console.error(error.message)
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }
    throw error
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET
    )
  } catch (error: any) {
    console.warn(`Stripe webhook signature verification failed: ${error.message}`)
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  let userId: string | undefined | null

  try {
    // Handle different event objects
    if (event.type.startsWith('customer.subscription.')) {
      const subscription = event.data.object as Stripe.Subscription
      const customer = await stripe.customers.retrieve(subscription.customer as string)
      if (!('deleted' in customer)) {
        userId = customer.metadata?.userId
      }
    } else if (event.type.startsWith('invoice.')) {
      const invoice = event.data.object as Stripe.Invoice
      if (invoice.customer) {
        const customer = await stripe.customers.retrieve(invoice.customer as string)
        if (!('deleted' in customer)) {
          userId = customer.metadata?.userId
        }
      }
    } else if (event.type === 'checkout.session.completed') {
      userId = session.metadata?.userId
    }

    if (!userId) {
      console.error('User ID missing in Stripe metadata or customer object')
      return NextResponse.json({ error: 'User ID missing in metadata' }, { status: 400 })
    }

    // Handle the different event types
    switch (event.type) {
      // A subscription was created or updated
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription & { current_period_end?: number }
        const priceId = subscription.items.data[0]?.price.id

        const tier = priceId === STRIPE_PRO_PRICE_ID ? 'PRO' : 'FREE'
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : null

        await prisma.subscription.upsert({
          where: { userId },
          update: {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer as string,
            stripePriceId: priceId,
            stripeCurrentPeriodEnd: periodEnd,
            tier,
          },
          create: {
            userId,
            tier,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer as string,
            stripePriceId: priceId,
            stripeCurrentPeriodEnd: periodEnd,
          },
        })
        break
      }

      // A subscription was canceled or ended
      case 'customer.subscription.deleted': {
        const deletedSubscription = event.data.object as Stripe.Subscription
        await prisma.subscription.upsert({
          where: { userId },
          update: {
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
            tier: 'FREE',
          },
          create: {
            userId,
            tier: 'FREE',
            stripeCustomerId: deletedSubscription.customer as string,
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
          },
        })
        break
      }

      // Payment succeeded (often fires on creation and renewal)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
        const lineItem = invoice.lines.data[0] as unknown as { price?: { id?: string } }
        const priceId = lineItem?.price?.id
        const tier = priceId === STRIPE_PRO_PRICE_ID ? 'PRO' : 'FREE'
        const stripeCustomerId =
          typeof invoice.customer === 'string' ? invoice.customer : null

        // Update the period end date on renewal
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string) as unknown as { id: string; current_period_end?: number }
          const periodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : null
          await prisma.subscription.upsert({
            where: { userId },
            update: {
              stripeSubscriptionId: subscription.id,
              stripeCustomerId,
              stripePriceId: priceId,
              stripeCurrentPeriodEnd: periodEnd,
              tier,
            },
            create: {
              userId,
              tier,
              stripeSubscriptionId: subscription.id,
              stripeCustomerId,
              stripePriceId: priceId,
              stripeCurrentPeriodEnd: periodEnd,
            },
          })
        }
        break
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }
  } catch (error) {
    console.error('Stripe webhook processing failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
