import { stripe, STRIPE_PRO_PRICE_ID, ensureStripeConfigured, StripeConfigurationError } from '@/lib/stripe'
import { RELEASE_OFFER } from '@/lib/release-offer'

export async function getProPrice() {
  ensureStripeConfigured('checkout')
  const price = await stripe.prices.retrieve(STRIPE_PRO_PRICE_ID!)
  if (!price.active || price.type !== 'recurring' || !price.recurring || price.recurring.usage_type !== 'licensed' || price.billing_scheme !== 'per_unit' || price.unit_amount === null || price.custom_unit_amount || price.transform_quantity) {
    throw new StripeConfigurationError('The configured Pro price must be an active fixed recurring price')
  }
  if (price.currency !== RELEASE_OFFER.currency || price.unit_amount !== RELEASE_OFFER.unitAmount || price.recurring.interval !== RELEASE_OFFER.interval || price.recurring.interval_count !== 1) {
    throw new StripeConfigurationError('The configured Pro price must match CAD 19 per month.')
  }
  return { id: price.id, label: RELEASE_OFFER.priceLabel }
}
