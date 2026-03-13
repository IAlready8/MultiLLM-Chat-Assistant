import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiLog } from '@/lib/api-logger'
import { logger } from '@/lib/logger'

const originalCommitSha = process.env.VERCEL_GIT_COMMIT_SHA
const originalCommitRef = process.env.VERCEL_GIT_COMMIT_REF
const originalGithubSha = process.env.GITHUB_SHA
const originalGithubRefName = process.env.GITHUB_REF_NAME

describe('logging safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.VERCEL_GIT_COMMIT_SHA
    delete process.env.VERCEL_GIT_COMMIT_REF
    delete process.env.GITHUB_SHA
    delete process.env.GITHUB_REF_NAME
  })

  afterEach(() => {
    if (originalCommitSha === undefined) {
      delete process.env.VERCEL_GIT_COMMIT_SHA
    } else {
      process.env.VERCEL_GIT_COMMIT_SHA = originalCommitSha
    }
    if (originalCommitRef === undefined) {
      delete process.env.VERCEL_GIT_COMMIT_REF
    } else {
      process.env.VERCEL_GIT_COMMIT_REF = originalCommitRef
    }
    if (originalGithubSha === undefined) {
      delete process.env.GITHUB_SHA
    } else {
      process.env.GITHUB_SHA = originalGithubSha
    }
    if (originalGithubRefName === undefined) {
      delete process.env.GITHUB_REF_NAME
    } else {
      process.env.GITHUB_REF_NAME = originalGithubRefName
    }
  })

  it('redacts secrets from structured api logs', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    apiLog.request({
      method: 'POST',
      path: '/api/test',
      status: 500,
      durationMs: 12,
      error:
        'Authorization: Bearer super-secret-token sk_test_1234567890 and postgresql://user:pass@host/db',
      meta: {
        authorization: 'Bearer another-secret',
        apiKey: 'sk_live_abcdefghijklmnopqrstuvwxyz',
        nested: {
          databaseUrl: 'postgresql://user:pass@host/db',
        },
      },
    })

    const payload = JSON.parse(String(errorSpy.mock.calls[0]?.[0]))
    expect(payload.release).toEqual({
      version: '0.1.0',
      commitSha: null,
      commitShort: null,
      branch: null,
    })
    expect(payload.error).toContain('[REDACTED]')
    expect(payload.error).not.toContain('super-secret-token')
    expect(payload.error).not.toContain('postgresql://user:pass@host/db')
    expect(payload.meta.authorization).toBe('[REDACTED]')
    expect(payload.meta.apiKey).toBe('[REDACTED]')
    expect(payload.meta.nested.databaseUrl).toBe('[REDACTED]')
  })

  it('sanitizes generic logger payloads before emission', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('route_failure', {
      error: new Error('token=top-secret sk_live_abcdefghijklmnopqrstuvwxyz'),
      authorization: 'Bearer very-secret',
      connectionString: 'redis://user:pass@host:6379',
      details: {
        webhookSecret: 'whsec_abcdefghijklmnopqrstuvwxyz',
      },
    })

    const payload = JSON.parse(String(errorSpy.mock.calls[0]?.[0]))
    expect(payload.release).toEqual({
      version: '0.1.0',
      commitSha: null,
      commitShort: null,
      branch: null,
    })
    expect(payload.error.message).toContain('[REDACTED]')
    expect(payload.error.message).not.toContain('top-secret')
    expect(payload.authorization).toBe('[REDACTED]')
    expect(payload.connectionString).toBe('[REDACTED]')
    expect(payload.details.webhookSecret).toBe('[REDACTED]')
  })
})
