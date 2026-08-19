import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

// Price IDs from your Stripe dashboard
export const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID?.trim()
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim()
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim()

const PLACEHOLDER_STRIPE_SECRET_KEY =
  'placeholder_stripe_secret_key_for_local_init'

// Backward-compatible flag used by existing call sites
export const isStripeConfigured = Boolean(
  STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET,
)

export const isStripeApiConfigured = Boolean(
  STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== PLACEHOLDER_STRIPE_SECRET_KEY,
)
export const isStripeCheckoutConfigured = Boolean(
  isStripeApiConfigured && STRIPE_PRO_PRICE_ID,
)
export const isStripeWebhookConfigured = Boolean(
  isStripeApiConfigured && STRIPE_WEBHOOK_SECRET,
)

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StripeConfigurationError'
  }
}

export function getStripeConfigurationUserMessage(
  mode: 'api' | 'checkout' | 'webhook',
): string {
  switch (mode) {
    case 'api':
      return 'Billing portal is currently unavailable.'
    case 'checkout':
      return 'Checkout is currently unavailable.'
    case 'webhook':
      return 'Webhook not configured'
    default:
      return 'Billing is currently unavailable.'
  }
}

export function ensureStripeConfigured(
  mode: 'api' | 'checkout' | 'webhook',
): void {
  switch (mode) {
    case 'api':
      if (!isStripeApiConfigured) {
        throw new StripeConfigurationError(
          'Billing is not configured. Missing STRIPE_SECRET_KEY.',
        )
      }
      break
    case 'checkout':
      if (!isStripeCheckoutConfigured) {
        throw new StripeConfigurationError(
          'Checkout is not configured. Missing STRIPE_SECRET_KEY or STRIPE_PRO_PRICE_ID.',
        )
      }
      break
    case 'webhook':
      if (!isStripeWebhookConfigured) {
        throw new StripeConfigurationError(
          'Stripe webhook is not configured. Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.',
        )
      }
      break
    default:
      break
  }
}

// Initialize Stripe client (placeholder key is only used when not configured,
// and guarded by ensureStripeConfigured before outbound Stripe API calls).
export const stripe = new Stripe(
  STRIPE_SECRET_KEY || PLACEHOLDER_STRIPE_SECRET_KEY,
  {
    apiVersion: '2026-02-25.clover',
    typescript: true,
  },
)

const isMissingStripeResource = (error: unknown): boolean =>
  error instanceof Stripe.errors.StripeInvalidRequestError &&
  error.code === 'resource_missing'

async function hasUsableStripeCustomer(customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    return !customer.deleted
  } catch (error) {
    if (isMissingStripeResource(error)) {
      return false
    }
    throw error
  }
}

/**
 * Retrieves a user's Stripe Customer ID from the DB,
 * or creates a new one in Stripe if it doesn't exist.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  ensureStripeConfigured('api')

  // 1. Check if user has a subscription and customer ID
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  })

  if (
    subscription?.stripeCustomerId &&
    (await hasUsableStripeCustomer(subscription.stripeCustomerId))
  ) {
    return subscription.stripeCustomerId
  }

  // 2. Create a new customer in Stripe
  const customer = await stripe.customers.create(
    {
      email,
      metadata: {
        app: 'multi-llm-chat-assistant',
        userId,
      },
    },
    {
      idempotencyKey: `multi-llm-customer:${userId}:${
        subscription?.stripeCustomerId || 'new'
      }`,
    },
  )

  // 3. Save the new customer ID and ensure a subscription row exists
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeCustomerId: customer.id,
    },
    create: {
      userId,
      tier: 'FREE',
      stripeCustomerId: customer.id,
    },
  })

  return customer.id
}
