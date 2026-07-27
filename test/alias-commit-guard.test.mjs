import { describe, expect, it, vi } from 'vitest'

import {
  fetchAndVerifyRelease,
  normalizeBaseUrl,
  normalizeExpectedCommitSha,
  normalizeHealthPath,
  normalizeTimeoutMs,
  verifyReleasePayload,
} from '../scripts/alias-commit-guard.mjs'

const EXPECTED_SHA = '68273ed6082f825299d98c7c3be2e990edc9ec86'

describe('production alias commit guard', () => {
  it('requires a full hexadecimal commit SHA', () => {
    expect(normalizeExpectedCommitSha(EXPECTED_SHA)).toBe(EXPECTED_SHA)
    expect(() => normalizeExpectedCommitSha('68273ed')).toThrow(
      'exactly 40 hexadecimal characters'
    )
    expect(() => normalizeExpectedCommitSha(`${EXPECTED_SHA.slice(0, 39)}z`)).toThrow(
      'exactly 40 hexadecimal characters'
    )
  })

  it('normalizes safe URLs and rejects embedded credentials', () => {
    expect(normalizeBaseUrl('https://example.com/')).toBe('https://example.com')
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow('http or https')
    expect(() => normalizeBaseUrl('https://user:pass@example.com')).toThrow(
      'must not contain credentials'
    )
  })

  it('validates health paths and bounded timeouts', () => {
    expect(normalizeHealthPath('/api/health')).toBe('/api/health')
    expect(() => normalizeHealthPath('//other-host/path')).toThrow(
      'exactly one slash'
    )
    expect(normalizeTimeoutMs('12000')).toBe(12000)
    expect(() => normalizeTimeoutMs('999')).toThrow('between 1000 and 60000')
  })

  it('requires release.commitSha to match exactly', () => {
    expect(
      verifyReleasePayload({ release: { commitSha: EXPECTED_SHA } }, EXPECTED_SHA)
    ).toBe(EXPECTED_SHA)
    expect(() =>
      verifyReleasePayload(
        { release: { commitSha: '57fa76861a7790f399586c27d297a0cb7e36951a' } },
        EXPECTED_SHA
      )
    ).toThrow('Production alias commit mismatch')
    expect(() => verifyReleasePayload({ release: {} }, EXPECTED_SHA)).toThrow(
      'missing a valid release.commitSha'
    )
  })

  it('checks HTTP status and JSON before accepting a release', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ release: { commitSha: EXPECTED_SHA } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com/',
        expectedCommitSha: EXPECTED_SHA,
        fetchImpl,
      })
    ).resolves.toEqual({
      commitSha: EXPECTED_SHA,
      url: 'https://example.com/api/health',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/api/health',
      expect.objectContaining({ redirect: 'error' })
    )

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        fetchImpl: vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })),
      })
    ).rejects.toThrow('HTTP 503')

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        fetchImpl: vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
      })
    ).rejects.toThrow('did not return valid JSON')
  })
})
