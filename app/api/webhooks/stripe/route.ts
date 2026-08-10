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

const entitlementStatuses = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
])

const supportedEventTypes = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  // Kept during the webhook endpoint migration from invoice.payment_succeeded.
  'invoice.payment_succeeded',
])

type LegacyInvoice = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null
}

const stripeId = (value: { id: string } | string | null | undefined) =>
  typeof value === 'string' ? value : value?.id

const getSubscriptionId = (event: Stripe.Event): string | undefined => {
  if (event.type.startsWith('customer.subscription.')) {
    return (event.data.object as Stripe.Subscription).id
  }

  if (event.type === 'checkout.session.completed') {
    return stripeId((event.data.object as Stripe.Checkout.Session).subscription)
  }

  if (event.type.startsWith('invoice.')) {
    const invoice = event.data.object as LegacyInvoice
    const modernSubscription =
      invoice.parent?.subscription_details?.subscription
    return stripeId(modernSubscription) || stripeId(invoice.subscription)
  }

  return undefined
}

const getCustomerId = (subscription: Stripe.Subscription) =>
  stripeId(subscription.customer)

const getCurrentPeriodEnd = (
  subscription: Stripe.Subscription,
  priceId: string | undefined,
): Date | null => {
  const matchingItem = subscription.items.data.find(
    (item) => item.price.id === priceId,
  )
  const periodEnd = matchingItem?.current_period_end
  return periodEnd ? new Date(periodEnd * 1000) : null
}

async function resolveUserId(
  subscription: Stripe.Subscription,
  customerId: string,
): Promise<string | undefined> {
  if (subscription.metadata?.userId) {
    return subscription.metadata.userId
  }

  const persistedSubscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { stripeSubscriptionId: subscription.id },
        { stripeCustomerId: customerId },
      ],
    },
    select: { userId: true },
  })
  if (persistedSubscription?.userId) {
    return persistedSubscription.userId
  }

  const customer = await stripe.customers.retrieve(customerId)
  if (!customer.deleted) {
    return customer.metadata?.userId
  }

  return undefined
}

async function reconcileSubscription(subscription: Stripe.Subscription) {
  const customerId = getCustomerId(subscription)
  if (!customerId) {
    throw new Error(`Stripe subscription ${subscription.id} has no customer ID`)
  }

  const userId = await resolveUserId(subscription, customerId)
  if (!userId) {
    throw new Error(
      `No application user is mapped to Stripe customer ${customerId}`,
    )
  }

  const proItem = subscription.items.data.find(
    (item) => item.price.id === STRIPE_PRO_PRICE_ID,
  )
  const priceId = (proItem || subscription.items.data[0])?.price.id
  const tier =
    proItem && entitlementStatuses.has(subscription.status) ? 'PRO' : 'FREE'

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: getCurrentPeriodEnd(subscription, priceId),
      stripeStatus: subscription.status,
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      tier,
    },
    create: {
      userId,
      tier,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: getCurrentPeriodEnd(subscription, priceId),
      stripeStatus: subscription.status,
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  })
}

/**
 * Signed Stripe webhook. Every supported event retrieves the latest Subscription
 * before updating entitlements, making duplicate and out-of-order deliveries safe.
 */
export async function POST(req: Request) {
  const body = await req.text()
  const headerStore = await headers()
  const signature = headerStore.get('Stripe-Signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 },
    )
  }

  try {
    ensureStripeConfigured('webhook')
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      console.error(error.message)
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 503 },
      )
    }
    throw error
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 503 },
    )
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.warn(`Stripe webhook signature verification failed: ${message}`)
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 })
  }

  if (!supportedEventTypes.has(event.type)) {
    return NextResponse.json({ received: true })
  }

  const subscriptionId = getSubscriptionId(event)
  if (!subscriptionId) {
    console.error(`Stripe event ${event.id} is missing a subscription ID`)
    return NextResponse.json(
      { error: 'Subscription ID missing from event' },
      { status: 400 },
    )
  }

  try {
    let subscription: Stripe.Subscription
    try {
      subscription = await stripe.subscriptions.retrieve(subscriptionId)
    } catch (error) {
      if (event.type !== 'customer.subscription.deleted') {
        throw error
      }
      subscription = event.data.object as Stripe.Subscription
    }

    await reconcileSubscription(subscription)
  } catch (error) {
    console.error('Stripe webhook processing failed:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ received: true })
}
