import { NextResponse } from 'next/server'

type CacheSource = 'disabled' | 'hit' | 'miss' | 'coalesced'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const DEFAULT_TTL_MS = 30_000
const cache = new Map<string, CacheEntry<unknown>>()
const inFlightLoads = new Map<string, Promise<unknown>>()

const isCacheEnabled = () =>
  ['1', 'true', 'yes', 'on'].includes(
    (process.env.ENABLE_API_READ_CACHE ?? '').toLowerCase()
  )

const getTtlMs = () => {
  const parsed = Number(process.env.API_READ_CACHE_TTL_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS
}

const buildResponse = <T>(value: T, source: CacheSource) => {
  const response = NextResponse.json(value)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Read-Cache', source)
  return response
}

const recordCacheResult = (
  route: string,
  source: CacheSource,
  durationMs: number
) => {
  console.info('api_read_cache_result', {
    route,
    source,
    durationMs,
  })
}

export const apiReadCacheKey = (route: string, userId: string) =>
  `${route}:${userId}`

export const invalidateApiReadCache = (key: string) => {
  cache.delete(key)
}

export const invalidateApiReadCaches = (keys: string[]) => {
  for (const key of keys) {
    invalidateApiReadCache(key)
  }
}

export const clearApiReadCache = () => {
  cache.clear()
  inFlightLoads.clear()
}

export async function cachedJsonResponse<T>(
  route: string,
  key: string,
  load: () => Promise<T>
): Promise<NextResponse> {
  const startedAt = Date.now()

  if (!isCacheEnabled()) {
    const value = await load()
    return buildResponse(value, 'disabled')
  }

  const now = Date.now()
  const cached = cache.get(key) as CacheEntry<T> | undefined
  if (cached && cached.expiresAt > now) {
    const durationMs = Date.now() - startedAt
    recordCacheResult(route, 'hit', durationMs)
    return buildResponse(cached.value, 'hit')
  }

  const existingLoad = inFlightLoads.get(key) as Promise<T> | undefined
  if (existingLoad) {
    const value = await existingLoad
    const durationMs = Date.now() - startedAt
    recordCacheResult(route, 'coalesced', durationMs)
    return buildResponse(value, 'coalesced')
  }

  const loadPromise = load()
  inFlightLoads.set(key, loadPromise)

  try {
    const value = await loadPromise
    cache.set(key, {
      value,
      expiresAt: Date.now() + getTtlMs(),
    })
    const durationMs = Date.now() - startedAt
    recordCacheResult(route, 'miss', durationMs)
    return buildResponse(value, 'miss')
  } finally {
    inFlightLoads.delete(key)
  }
}
