import { getProPrice } from '@/lib/billing-price'
import { readQuotaLimits } from '@/lib/llm-quota'
import { isStripeCheckoutConfigured } from '@/lib/stripe'
import type { PlanAllowances } from '@/lib/billing-plans'

/**
 * The offer shown to signed-out visitors on /pricing.
 *
 * The page is public, so the Stripe price lookup behind it is cached per
 * server instance and coalesced: anonymous traffic can never turn into a
 * stream of Stripe API calls. Failures are cached briefly for the same reason.
 */

export type PublicOffer = {
  /** True only when a visitor could actually subscribe after signing in. */
  checkoutOpen: boolean
  /** Formatted Pro price read from Stripe, e.g. "$19.00 / month". */
  proPriceLabel: string | null
  /** Enforced monthly allowances; null when the server enforces none. */
  allowances: PlanAllowances | null
}

const PRICE_TTL_MS = 10 * 60 * 1000
const PRICE_FAILURE_TTL_MS = 60 * 1000

type PriceEntry = { label: string | null; expiresAt: number }

let cached: PriceEntry | null = null
let inFlight: Promise<string | null> | null = null

const loadPriceLabel = async (now: () => number): Promise<string | null> => {
  if (!isStripeCheckoutConfigured) return null
  if (cached && cached.expiresAt > now()) return cached.label
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const price = await getProPrice()
      cached = { label: price.label, expiresAt: now() + PRICE_TTL_MS }
      return price.label
    } catch {
      cached = { label: null, expiresAt: now() + PRICE_FAILURE_TTL_MS }
      return null
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

const readAllowances = (): PlanAllowances | null => {
  try {
    return readQuotaLimits()
  } catch {
    // A malformed limit configuration is an operator problem (reported on the
    // admin status page). The public page must not state a limit it cannot read.
    return null
  }
}

export const getPublicOffer = async (
  now: () => number = Date.now,
): Promise<PublicOffer> => {
  const proPriceLabel = await loadPriceLabel(now)
  return {
    // Without a readable price the Billing page keeps checkout closed too.
    checkoutOpen: isStripeCheckoutConfigured && proPriceLabel !== null,
    proPriceLabel,
    allowances: readAllowances(),
  }
}

/** Test seam: forget the cached price. */
export const resetPublicOfferCache = (): void => {
  cached = null
  inFlight = null
}
