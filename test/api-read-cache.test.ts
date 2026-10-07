import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedJsonResponse,
  clearApiReadCache,
  invalidateApiReadCache,
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
  it('does not repopulate stale data after a concurrent save invalidates an in-flight read', async () => {
    let finishOld!: (value: string) => void
    let finishNew!: (value: string) => void
    const key = 'conversation:user-1'
    const old = cachedJsonResponse('/api/conversations', key, () => new Promise<string>(resolve => { finishOld = resolve }))
    invalidateApiReadCache(key)
    const loadNew = vi.fn(() => new Promise<string>(resolve => { finishNew = resolve }))
    const fresh = cachedJsonResponse('/api/conversations', key, loadNew)
    finishOld('before-save')
    await old
    const coalesced = cachedJsonResponse('/api/conversations', key, loadNew)
    expect(loadNew).toHaveBeenCalledTimes(1)
    finishNew('after-save')
    expect(await (await fresh).json()).toBe('after-save')
    expect(await (await coalesced).json()).toBe('after-save')
    const cached = await cachedJsonResponse('/api/conversations', key, loadNew)
    expect(await cached.json()).toBe('after-save')
    expect(loadNew).toHaveBeenCalledTimes(1)
  })

})
