import { getAppName } from '@/lib/app-name'

/**
 * Operator-specific facts for the public legal pages.
 *
 * Nothing here is invented: every value comes from the deployment
 * environment, and a clause that depends on an unset value is omitted from
 * the page instead of being rendered with a made-up name or address.
 */

// Bump when the wording of /terms or /privacy changes in a way users should
// be told about.
export const LEGAL_LAST_UPDATED = '2026-11-10'

const clean = (value: string | undefined, max: number): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

export type LegalDetails = {
  productName: string
  /** The person or company that operates this deployment. */
  operatorName: string | null
  contactEmail: string | null
  governingLaw: string | null
}

export const getLegalDetails = (): LegalDetails => {
  const email = clean(process.env.SUPPORT_EMAIL, 254)
  return {
    productName: getAppName(),
    operatorName: clean(process.env.LEGAL_ENTITY_NAME, 120),
    contactEmail: email && EMAIL_PATTERN.test(email) ? email : null,
    governingLaw: clean(process.env.LEGAL_GOVERNING_LAW, 120),
  }
}

export const formatLegalDate = (isoDate: string): string => {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
