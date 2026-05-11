import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedJsonResponse,
  clearApiReadCache,
} from '@/lib/api-read-cache'

describe('api-read-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearApiReadCache()
    process.env.ENABLE_API_READ_CACHE = 'true'
    process.env.API_READ_CACHE_TTL_MS = '60000'
  })

  it('coalesces concurrent loads for the same key', async () => {
    const load = vi.fn(
      () =>
        new Promise<{ value: string }>((resolve) => {
          setTimeout(() => resolve({ value: 'loaded' }), 5)
        })
    )

    const [first, second] = await Promise.all([
      cachedJsonResponse('/api/example', 'example:user-1', load),
      cachedJsonResponse('/api/example', 'example:user-1', load),
    ])

    expect(first.headers.get('X-Read-Cache')).toBe('miss')
    expect(second.headers.get('X-Read-Cache')).toBe('coalesced')
    expect(await first.json()).toEqual({ value: 'loaded' })
    expect(await second.json()).toEqual({ value: 'loaded' })
    expect(load).toHaveBeenCalledTimes(1)
  })
})
