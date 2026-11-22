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


  it('retains recently used entries during bounded eviction', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      for (let index = 0; index < 512; index++) {
        await cachedJsonResponse('/api/example', 'recent:user-' + index, async () => index)
      }
      const cached = await cachedJsonResponse('/api/example', 'recent:user-0', async () => 999)
      expect(cached.headers.get('X-Read-Cache')).toBe('hit')
      expect(await cached.json()).toBe(0)

      await cachedJsonResponse('/api/example', 'recent:user-512', async () => 512)

      const evicted = await cachedJsonResponse('/api/example', 'recent:user-1', async () => 1001)
      expect(evicted.headers.get('X-Read-Cache')).toBe('miss')
      const retained = await cachedJsonResponse('/api/example', 'recent:user-0', async () => 999)
      expect(retained.headers.get('X-Read-Cache')).toBe('hit')
      expect(await retained.json()).toBe(0)
    } finally {
      log.mockRestore()
    }
  })

  it('evicts least-recently-used entries at a fixed maximum', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      for (let i = 0; i < 513; i++) {
        await cachedJsonResponse('/api/example', 'example:user-' + i, async () => ({ value: i }))
      }
      const load = vi.fn(async () => ({ value: 'fresh' }))
      const response = await cachedJsonResponse('/api/example', 'example:user-0', load)
      expect(response.headers.get('X-Read-Cache')).toBe('miss')
      expect(await response.json()).toEqual({ value: 'fresh' })
      expect(load).toHaveBeenCalledOnce()
    } finally {
      log.mockRestore()
    }
  })
})
