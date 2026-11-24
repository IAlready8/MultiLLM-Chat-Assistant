/**
 * Sales tax (for example GST/HST) is collected only after the operator has
 * registered with the tax authority and added that registration in Stripe Tax.
 * Until then this stays off and Checkout charges the tax-exclusive list price
 * with no tax line. The flag is an operator decision; code never infers it.
 */
export function isStripeAutomaticTaxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === 'true'
}

/**
 * Checkout parameters for Stripe Tax. Automatic tax needs the customer's
 * billing address; `customer_update.address` saves it on the existing Stripe
 * customer so renewal invoices are taxed from the same address.
 */
export function checkoutTaxParams(enabled: boolean) {
  if (!enabled) return {}
  return {
    automatic_tax: { enabled: true },
    billing_address_collection: 'required' as const,
    customer_update: { address: 'auto' as const },
  }
}
