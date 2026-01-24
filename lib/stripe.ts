import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

// Price IDs from your Stripe dashboard
export const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder'
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

// Flag to check if Stripe is properly configured
export const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET

// Initialize Stripe client (uses placeholder during build if not configured)
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-11-17.clover' as const, // Use a consistent API version
  typescript: true,
})

/**
 * Retrieves a user's Stripe Customer ID from the DB,
 * or creates a new one in Stripe if it doesn't exist.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  // 1. Check if user has a subscription and customer ID
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  })

  if (subscription?.stripeCustomerId) {
    return subscription.stripeCustomerId
  }

  // 2. Create a new customer in Stripe
  const customer = await stripe.customers.create({
    email: email,
    metadata: {
      userId: userId,
    },
  })

  // 3. Save the new customer ID to the user's subscription record
  await prisma.subscription.update({
    where: { userId },
    data: {
      stripeCustomerId: customer.id,
    },
  })

  return customer.id
}