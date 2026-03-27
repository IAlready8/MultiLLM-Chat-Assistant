import { describe, expect, it } from 'vitest'
import {
  extractAttributionFromSearchParams,
  mergeAttributionIntoPayload,
  parseSerializedAttribution,
  readAttributionFromCookieHeader,
  serializeAttribution,
} from '@/lib/acquisition-attribution'

describe('acquisition attribution helpers', () => {
  it('extracts and sanitizes attribution from search params', () => {
    const attribution = extractAttributionFromSearchParams(
      new URLSearchParams({
        source: 'Founder Outbound',
        campaign: 'Agency Sprint / March',
        cohort: 'Toronto#1',
      })
    )

    expect(attribution).toEqual({
      source: 'founder-outbound',
      campaign: 'agency-sprint-march',
      cohort: 'toronto-1',
    })
  })

  it('serializes and parses attribution safely', () => {
    const serialized = serializeAttribution({
      source: 'founder-outbound',
      campaign: 'agency-sprint',
      cohort: 'wave-1',
    })

    expect(parseSerializedAttribution(serialized ?? null)).toEqual({
      source: 'founder-outbound',
      campaign: 'agency-sprint',
      cohort: 'wave-1',
    })
  })

  it('reads attribution from cookie headers', () => {
    const serialized = serializeAttribution({
      source: 'demo',
      campaign: 'consultants',
      cohort: 'batch-a',
    })

    expect(
      readAttributionFromCookieHeader(
        `theme=dark; multillm_acquisition=${serialized}; other=value`
      )
    ).toEqual({
      source: 'demo',
      campaign: 'consultants',
      cohort: 'batch-a',
    })
  })

  it('reads attribution cookies even when cookie separators omit spaces', () => {
    const serialized = serializeAttribution({
      source: 'demo',
      campaign: 'consultants',
      cohort: 'batch-a',
    })

    expect(
      readAttributionFromCookieHeader(
        `theme=dark;multillm_acquisition=${serialized};other=value`
      )
    ).toEqual({
      source: 'demo',
      campaign: 'consultants',
      cohort: 'batch-a',
    })
  })

  it('merges attribution into analytics payloads without dropping existing fields', () => {
    expect(
      mergeAttributionIntoPayload(
        { provider: 'openai' },
        {
          source: 'founder-outbound',
          campaign: 'agency-sprint',
          cohort: 'wave-1',
        }
      )
    ).toEqual({
      provider: 'openai',
      acquisitionSource: 'founder-outbound',
      acquisitionCampaign: 'agency-sprint',
      acquisitionCohort: 'wave-1',
    })
  })
})
