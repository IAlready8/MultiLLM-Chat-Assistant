import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkProviderRateLimit } from '@/lib/provider-rate-limit'
import { resetAll } from '@/lib/rate-limit'

describe('provider rate limit', () => {
  beforeEach(() => {
    resetAll()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T18:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scopes request budgets by user and provider', async () => {
    const config = { requests: 1, window: 60_000 }

    await expect(
      checkProviderRateLimit('user-1', 'openai', config)
    ).resolves.toMatchObject({ allowed: true, remaining: 0 })
    await expect(
      checkProviderRateLimit('user-1', 'openai', config)
    ).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 60_000,
    })
    await expect(
      checkProviderRateLimit('user-1', 'anthropic', config)
    ).resolves.toMatchObject({ allowed: true })
    await expect(
      checkProviderRateLimit('user-2', 'openai', config)
    ).resolves.toMatchObject({ allowed: true })
  })

  it('allows requests again after the configured window', async () => {
    const config = { requests: 1, window: 1_000 }

    await checkProviderRateLimit('user-1', 'openai', config)
    vi.advanceTimersByTime(1_001)

    await expect(
      checkProviderRateLimit('user-1', 'openai', config)
    ).resolves.toMatchObject({ allowed: true, retryAfterMs: 0 })
  })

  it('fails closed for invalid provider limits', async () => {
    await expect(
      checkProviderRateLimit('user-1', 'openai', {
        requests: 0,
        window: 60_000,
      })
    ).resolves.toEqual({ allowed: false, remaining: 0, retryAfterMs: 0 })

    await expect(
      checkProviderRateLimit('user-1', 'openai', {
        requests: 1,
        window: Number.NaN,
      })
    ).resolves.toEqual({ allowed: false, remaining: 0, retryAfterMs: 0 })
  })
})
