'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ACQUISITION_COOKIE_NAME,
  extractAttributionFromSearchParams,
  hasAttribution,
  serializeAttribution,
} from '@/lib/acquisition-attribution'

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30

export function AcquisitionAttributionCapture() {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!searchParams) {
      return
    }

    const attribution = extractAttributionFromSearchParams(searchParams)
    const serialized = serializeAttribution(attribution)

    if (!serialized || !hasAttribution(attribution)) {
      return
    }

    document.cookie = `${ACQUISITION_COOKIE_NAME}=${serialized}; Max-Age=${THIRTY_DAYS_IN_SECONDS}; Path=/; SameSite=Lax`
  }, [searchParams])

  return null
}
