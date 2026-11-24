import { RELEASE_OFFER } from '@/lib/release-offer'
import { stripe, STRIPE_PRO_PRICE_ID, ensureStripeConfigured, StripeConfigurationError } from '@/lib/stripe'
import { isStripeAutomaticTaxEnabled } from '@/lib/stripe-tax'

export async function getProPrice() {
  ensureStripeConfigured('checkout')
  const price = await stripe.prices.retrieve(STRIPE_PRO_PRICE_ID!)
  if (!price.active || price.type !== 'recurring' || !price.recurring || price.recurring.usage_type !== 'licensed' || price.billing_scheme !== 'per_unit' || price.unit_amount === null || price.custom_unit_amount || price.transform_quantity) {
    throw new StripeConfigurationError('The configured Pro price must be an active fixed recurring price')
  }
  if (price.currency !== RELEASE_OFFER.currency || price.unit_amount !== RELEASE_OFFER.unitAmount || price.recurring.interval !== RELEASE_OFFER.interval || price.recurring.interval_count !== 1) throw new StripeConfigurationError('The configured Pro price must match the approved CAD 19 monthly offer')
  // The approved offer is tax-exclusive: tax, when collected, is added on top.
  if (price.tax_behavior === 'inclusive') throw new StripeConfigurationError('The configured Pro price must be tax-exclusive')
  const automaticTax = isStripeAutomaticTaxEnabled()
  if (automaticTax && price.tax_behavior !== 'exclusive') throw new StripeConfigurationError('Automatic tax requires the Pro price tax behavior to be exclusive')
  const digits = ['isk', 'ugx'].includes(price.currency) ? 2 : new Intl.NumberFormat('en', { style: 'currency', currency: price.currency }).resolvedOptions().maximumFractionDigits ?? 2
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(price.unit_amount / 10 ** digits)
  const { interval, interval_count: count } = price.recurring
  const label = `${amount} / ${count === 1 ? interval : `${count} ${interval}s`}`
  return { id: price.id, label: automaticTax ? `${label} + tax` : label }
}
