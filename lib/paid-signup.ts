import { getLegalDetails } from '@/lib/legal'
import { readQuotaLimits } from '@/lib/llm-quota'
import { RELEASE_OFFER } from '@/lib/release-offer'

/** A legal/commercial approval cannot override broken or drifting allowances. */
export function isPaidSignupEnabled() {
  if (process.env.PAID_SIGNUP_ENABLED !== 'true' || process.env.LEGAL_NOTICE_APPROVED !== 'true') return false
  const legal = getLegalDetails()
  if (!legal.operatorName || !legal.contactEmail || legal.operatorName === legal.productName) return false
  try {
    const limits = readQuotaLimits()
    return Boolean(limits && Object.values(limits).every(value => value !== null)
      && limits.FREE === RELEASE_OFFER.limits.FREE && limits.PRO === RELEASE_OFFER.limits.PRO)
  } catch { return false }
}
