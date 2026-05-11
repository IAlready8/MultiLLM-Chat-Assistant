import { logger } from '@/lib/logger'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const readCache = new Map<string, CacheEntry<unknown>>()
const inFlightCache = new Map<string, Promise<CacheEntry<unknown>>>()

const isEnabled = () => process.env.ENABLE_API_READ_CACHE === 'true'
const getTtlMs = () => Math.max(1000, Number(process.env.API_READ_CACHE_TTL_MS ?? '30000'))

export type ReadCacheResult<T> = {
  value: T
  source: 'cache_hit' | 'coalesced' | 'origin'
  durationMs: number
}

export async function withReadCache<T>(
  key: string,
  loader: () => Promise<T>
): Promise<ReadCacheResult<T>> {
  const start = Date.now()

  if (!isEnabled()) {
    return { value: await loader(), source: 'origin', durationMs: Date.now() - start }
  }

  const cached = readCache.get(key) as CacheEntry<T> | undefined
  if (cached && cached.expiresAt > Date.now()) {
    return { value: cached.value, source: 'cache_hit', durationMs: Date.now() - start }
  }

  if (cached && cached.expiresAt <= Date.now()) {
    readCache.delete(key)
  }

  const inFlight = inFlightCache.get(key) as Promise<CacheEntry<T>> | undefined
  if (inFlight) {
    const entry = await inFlight
    return { value: entry.value, source: 'coalesced', durationMs: Date.now() - start }
  }

  const loadPromise = loader().then(value => ({ value, expiresAt: Date.now() + getTtlMs() }))
  inFlightCache.set(key, loadPromise as Promise<CacheEntry<unknown>>)

  try {
    const entry = await loadPromise
    readCache.set(key, entry as CacheEntry<unknown>)
    return { value: entry.value, source: 'origin', durationMs: Date.now() - start }
  } finally {
    inFlightCache.delete(key)
  }
}

export function invalidateReadCache(key: string) {
  readCache.delete(key)
  inFlightCache.delete(key)
}

export function logReadCacheMetrics(route: string, source: ReadCacheResult<unknown>['source'], durationMs: number) {
  logger.info('api_read_cache_result', {
    route,
    source,
    durationMs,
  })
}
