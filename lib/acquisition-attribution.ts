export type AcquisitionAttribution = {
  source?: string
  campaign?: string
  cohort?: string
}

export const ACQUISITION_COOKIE_NAME = 'multillm_acquisition'
const MAX_VALUE_LENGTH = 64

const sanitizeValue = (value: string | null): string | undefined => {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  const sanitized = normalized
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!sanitized) {
    return undefined
  }

  return sanitized.slice(0, MAX_VALUE_LENGTH)
}

export const extractAttributionFromSearchParams = (
  searchParams: URLSearchParams
): AcquisitionAttribution => ({
  source: sanitizeValue(searchParams.get('source')),
  campaign: sanitizeValue(searchParams.get('campaign')),
  cohort: sanitizeValue(searchParams.get('cohort')),
})

export const hasAttribution = (attribution: AcquisitionAttribution): boolean =>
  Boolean(attribution.source || attribution.campaign || attribution.cohort)

export const serializeAttribution = (
  attribution: AcquisitionAttribution
): string | null => {
  if (!hasAttribution(attribution)) {
    return null
  }

  return encodeURIComponent(JSON.stringify(attribution))
}

export const parseSerializedAttribution = (
  value: string | null | undefined
): AcquisitionAttribution => {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    return {
      source: sanitizeValue(
        typeof parsed.source === 'string' ? parsed.source : null
      ),
      campaign: sanitizeValue(
        typeof parsed.campaign === 'string' ? parsed.campaign : null
      ),
      cohort: sanitizeValue(
        typeof parsed.cohort === 'string' ? parsed.cohort : null
      ),
    }
  } catch {
    return {}
  }
}

export const readAttributionFromCookieHeader = (
  cookieHeader: string | null | undefined
): AcquisitionAttribution => {
  if (!cookieHeader) {
    return {}
  }

  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${ACQUISITION_COOKIE_NAME}=([^;]+)`)
  )

  return parseSerializedAttribution(match?.[1])
}

export const mergeAttributionIntoPayload = (
  payload: Record<string, unknown>,
  attribution: AcquisitionAttribution
): Record<string, unknown> => {
  if (!hasAttribution(attribution)) {
    return payload
  }

  return {
    ...payload,
    acquisitionSource: attribution.source ?? null,
    acquisitionCampaign: attribution.campaign ?? null,
    acquisitionCohort: attribution.cohort ?? null,
  }
}
