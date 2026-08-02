import { describe, expect, it, vi } from 'vitest'

import {
  fetchAndVerifyRelease,
  normalizeBaseUrl,
  normalizeExpectedCommitSha,
  normalizeExpectedVersion,
  normalizeHealthPath,
  normalizeTimeoutMs,
  verifyHealthyPayload,
  verifyReleasePayload,
  verifyReleaseVersion,
} from '../scripts/alias-commit-guard.mjs'

const EXPECTED_SHA = '68273ed6082f825299d98c7c3be2e990edc9ec86'
const EXPECTED_VERSION = '0.2.0-private-pilot.3'
const healthyRelease = {
  status: 'healthy',
  release: {
    commitSha: EXPECTED_SHA,
    version: EXPECTED_VERSION,
  },
}

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

  it('requires a bounded release version identifier', () => {
    expect(normalizeExpectedVersion(EXPECTED_VERSION)).toBe(EXPECTED_VERSION)
    expect(() => normalizeExpectedVersion('')).toThrow('non-empty version identifier')
    expect(() => normalizeExpectedVersion('release version with spaces')).toThrow(
      'non-empty version identifier'
    )
    expect(() => normalizeExpectedVersion(`v${'1'.repeat(128)}`)).toThrow(
      'non-empty version identifier'
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

  it('requires a healthy status and exact release.version', () => {
    expect(verifyHealthyPayload(healthyRelease)).toBe('healthy')
    expect(verifyReleaseVersion(healthyRelease, EXPECTED_VERSION)).toBe(
      EXPECTED_VERSION
    )
    expect(() => verifyHealthyPayload({ ...healthyRelease, status: 'degraded' })).toThrow(
      'not healthy'
    )
    expect(() => verifyHealthyPayload({ release: healthyRelease.release })).toThrow(
      'observed missing'
    )
    expect(() =>
      verifyReleaseVersion(healthyRelease, '0.2.0-private-pilot.2')
    ).toThrow('Production alias version mismatch')
    expect(() =>
      verifyReleaseVersion(
        { ...healthyRelease, release: { commitSha: EXPECTED_SHA } },
        EXPECTED_VERSION
      )
    ).toThrow('missing a valid release.version')
  })

  it('checks HTTP status and JSON before accepting a release', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(healthyRelease), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com/',
        expectedCommitSha: EXPECTED_SHA,
        expectedVersion: EXPECTED_VERSION,
        fetchImpl,
      })
    ).resolves.toEqual({
      commitSha: EXPECTED_SHA,
      url: 'https://example.com/api/health',
      version: EXPECTED_VERSION,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/api/health',
      expect.objectContaining({ redirect: 'error' })
    )

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        expectedVersion: EXPECTED_VERSION,
        fetchImpl: vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })),
      })
    ).rejects.toThrow('HTTP 503')

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        expectedVersion: EXPECTED_VERSION,
        fetchImpl: vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
      })
    ).rejects.toThrow('did not return valid JSON')
  })

  it('rejects redirects and missing release metadata', async () => {
    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        expectedVersion: EXPECTED_VERSION,
        fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 302 })),
      })
    ).rejects.toThrow('HTTP 302')

    await expect(
      fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        expectedVersion: EXPECTED_VERSION,
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ status: 'healthy', release: {} }), {
            status: 200,
          })
        ),
      })
    ).rejects.toThrow('missing a valid release.commitSha')
  })

  it('fails with a bounded timeout', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      )

      const verification = fetchAndVerifyRelease({
        baseUrl: 'https://example.com',
        expectedCommitSha: EXPECTED_SHA,
        expectedVersion: EXPECTED_VERSION,
        timeoutMs: 1000,
        fetchImpl,
      })
      const expectation = expect(verification).rejects.toThrow(
        'timed out after 1000 milliseconds'
      )
      await vi.advanceTimersByTimeAsync(1000)
      await expectation
    } finally {
      vi.useRealTimers()
    }
  })
})
