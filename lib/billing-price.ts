import { stripe, STRIPE_PRO_PRICE_ID, ensureStripeConfigured, StripeConfigurationError } from '@/lib/stripe'

export async function getProPrice() {
  ensureStripeConfigured('checkout')
  const price = await stripe.prices.retrieve(STRIPE_PRO_PRICE_ID!)
  if (!price.active || price.type !== 'recurring' || !price.recurring || price.recurring.usage_type !== 'licensed' || price.billing_scheme !== 'per_unit' || price.unit_amount === null || price.custom_unit_amount || price.transform_quantity) {
    throw new StripeConfigurationError('The configured Pro price must be an active fixed recurring price')
  }
  const digits = ['isk', 'ugx'].includes(price.currency) ? 2 : new Intl.NumberFormat('en', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(price.unit_amount / 10 ** digits)
  const { interval, interval_count: count } = price.recurring
  return { id: price.id, label: `${amount} / ${count === 1 ? interval : `${count} ${interval}s`}` }
}
