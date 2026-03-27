'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ACQUISITION_COOKIE_NAME,
  extractAttributionFromSearchParams,
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

    if (!serialized) {
      return
    }

    let cookieValue = `${ACQUISITION_COOKIE_NAME}=${serialized}; Max-Age=${THIRTY_DAYS_IN_SECONDS}; Path=/; SameSite=Lax`

    if (window.location.protocol === 'https:') {
      cookieValue += '; Secure'
    }

    document.cookie = cookieValue
  }, [searchParams])

  return null
}
