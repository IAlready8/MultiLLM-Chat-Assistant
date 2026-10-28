import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PROVIDER_ENDPOINT_ERROR_CODE, providerFetch } from '@/lib/provider-endpoint'
import {
  assertBreakerAllowsRequest,
  backoffDelayMs,
  breakerStateFor,
  isRetryableStatus,
  isTransientFetchError,
  parseRetryAfterMs,
  providerBreakerSnapshot,
  ProviderCircuitOpenError,
  recordBreakerFailure,
  recordBreakerSuccess,
  resetProviderBreakers,
  resolveProviderResilienceConfig,
  withProviderResilience,
  type ProviderResilienceConfig,
} from '@/lib/provider-resilience'

const config = (overrides: Partial<ProviderResilienceConfig> = {}): ProviderResilienceConfig => ({
  retries: 2,
  baseDelayMs: 100,
  maxDelayMs: 1_000,
  breaker: { enabled: true, failureThreshold: 3, openMs: 30_000 },
  ...overrides,
})

/** Deterministic hooks: no real waiting, no real jitter. */
const hooks = () => {
  const waits: number[] = []
  return {
    waits,
    value: {
      sleep: async (ms: number) => {
        waits.push(ms)
      },
      random: () => 1,
      now: () => 1_000_000,
    },
  }
}

beforeEach(() => {
  resetProviderBreakers()
})

afterEach(() => {
  resetProviderBreakers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('retry classification', () => {
  it('retries only transient upstream statuses', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true)
    }
    for (const status of [200, 201, 400, 401, 403, 404, 409, 413, 422, 501]) {
      expect(isRetryableStatus(status)).toBe(false)
    }
  })

  it('treats transport faults as transient but never aborts or policy errors', () => {
    expect(isTransientFetchError(new TypeError('fetch failed'))).toBe(true)
    expect(isTransientFetchError(new Error('socket hang up'))).toBe(true)
    expect(
      isTransientFetchError(
        Object.assign(new Error('request to host failed'), {
          cause: { code: 'ECONNRESET' },
        }),
      ),
    ).toBe(true)

    const abort = new DOMException('aborted', 'AbortError')
    expect(isTransientFetchError(abort)).toBe(false)
    const timeout = new DOMException('timed out', 'TimeoutError')
    expect(isTransientFetchError(timeout)).toBe(false)
    expect(
      isTransientFetchError(
        Object.assign(new Error('blocked'), { code: PROVIDER_ENDPOINT_ERROR_CODE }),
      ),
    ).toBe(false)
    expect(isTransientFetchError(new Error('model does not exist'))).toBe(false)
  })

  it('matches the endpoint policy code exported by provider-endpoint', () => {
    // Guards the structurally-matched literal in lib/provider-resilience.ts
    // against drift, since importing it there would create a module cycle.
    expect(PROVIDER_ENDPOINT_ERROR_CODE).toBe('PROVIDER_ENDPOINT_BLOCKED')
  })
})

describe('parseRetryAfterMs', () => {
  it('reads delta-seconds and HTTP-date forms', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    expect(parseRetryAfterMs('2', now)).toBe(2_000)
    expect(parseRetryAfterMs('0', now)).toBe(0)
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000)
  })

  it('rejects malformed, absent and past values, and clamps the far future', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z')
    expect(parseRetryAfterMs(null, now)).toBeNull()
    expect(parseRetryAfterMs('', now)).toBeNull()
    expect(parseRetryAfterMs('   ', now)).toBeNull()
    expect(parseRetryAfterMs('soon', now)).toBeNull()
    expect(parseRetryAfterMs('-5', now)).toBeNull()
    expect(parseRetryAfterMs('Thu, 01 Jan 2025 00:00:00 GMT', now)).toBeNull()
    expect(parseRetryAfterMs('99999', now)).toBe(3_600_000)
  })
})

describe('backoffDelayMs', () => {
  it('grows exponentially and respects the ceiling', () => {
    const settings = { baseDelayMs: 100, maxDelayMs: 1_000 }
    expect(backoffDelayMs(0, settings, () => 1)).toBe(100)
    expect(backoffDelayMs(1, settings, () => 1)).toBe(200)
    expect(backoffDelayMs(2, settings, () => 1)).toBe(400)
    expect(backoffDelayMs(9, settings, () => 1)).toBe(1_000)
  })

  it('applies full jitter across the whole window', () => {
    const settings = { baseDelayMs: 100, maxDelayMs: 1_000 }
    expect(backoffDelayMs(3, settings, () => 0)).toBe(0)
    expect(backoffDelayMs(3, settings, () => 0.5)).toBe(400)
  })
})

describe('resolveProviderResilienceConfig', () => {
  it('is inert under NODE_ENV=test so existing provider suites are unchanged', () => {
    const resolved = resolveProviderResilienceConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)
    expect(resolved.retries).toBe(0)
    expect(resolved.breaker.enabled).toBe(false)
  })

  it('defaults to a small retry budget and an enabled breaker in production', () => {
    const resolved = resolveProviderResilienceConfig({
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv)
    expect(resolved.retries).toBe(2)
    expect(resolved.baseDelayMs).toBe(250)
    expect(resolved.maxDelayMs).toBe(4_000)
    expect(resolved.breaker).toEqual({
      enabled: true,
      failureThreshold: 5,
      openMs: 30_000,
    })
  })

  it('reads overrides and clamps hostile values', () => {
    const resolved = resolveProviderResilienceConfig({
      NODE_ENV: 'production',
      LLM_FETCH_RETRIES: '99',
      LLM_FETCH_RETRY_BASE_MS: '1',
      LLM_FETCH_RETRY_MAX_MS: '999999',
      PROVIDER_BREAKER_ENABLED: 'false',
      PROVIDER_BREAKER_THRESHOLD: '0',
      PROVIDER_BREAKER_OPEN_MS: '1',
    } as NodeJS.ProcessEnv)
    expect(resolved.retries).toBe(5)
    expect(resolved.baseDelayMs).toBe(10)
    expect(resolved.maxDelayMs).toBe(60_000)
    expect(resolved.breaker.enabled).toBe(false)
    expect(resolved.breaker.failureThreshold).toBe(1)
    expect(resolved.breaker.openMs).toBe(1_000)
  })

  it('ignores non-numeric overrides rather than coercing them to zero', () => {
    const resolved = resolveProviderResilienceConfig({
      NODE_ENV: 'production',
      LLM_FETCH_RETRIES: 'many',
    } as NodeJS.ProcessEnv)
    expect(resolved.retries).toBe(2)
  })

  it('allows the breaker to be forced on inside tests', () => {
    const resolved = resolveProviderResilienceConfig({
      NODE_ENV: 'test',
      PROVIDER_BREAKER_ENABLED: 'true',
    } as NodeJS.ProcessEnv)
    expect(resolved.breaker.enabled).toBe(true)
  })
})

describe('withProviderResilience retry behaviour', () => {
  it('returns a success without retrying', async () => {
    const attempt = vi.fn(async () => new Response('ok', { status: 200 }))
    const timers = hooks()

    const response = await withProviderResilience('openai', attempt, config(), timers.value)

    expect(response.status).toBe(200)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(timers.waits).toEqual([])
  })

  it('retries a 503 and returns the first success', async () => {
    const attempt = vi
      .fn<(index: number) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const timers = hooks()

    const response = await withProviderResilience('openai', attempt, config(), timers.value)

    expect(response.status).toBe(200)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(timers.waits).toEqual([100])
  })

  it('exhausts the budget and surfaces the final upstream response', async () => {
    const attempt = vi.fn(async () => new Response('down', { status: 502 }))
    const timers = hooks()

    const response = await withProviderResilience(
      'openai',
      attempt,
      config({ retries: 2 }),
      timers.value,
    )

    expect(response.status).toBe(502)
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(timers.waits).toEqual([100, 200])
  })

  it('does not retry a client error and returns it unchanged', async () => {
    const attempt = vi.fn(async () => new Response('bad key', { status: 401 }))
    const timers = hooks()

    const response = await withProviderResilience('openai', attempt, config(), timers.value)

    expect(response.status).toBe(401)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(timers.waits).toEqual([])
  })

  it('honours Retry-After in preference to computed backoff', async () => {
    const attempt = vi
      .fn<(index: number) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'Retry-After': '1' } }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const timers = hooks()

    await withProviderResilience('openai', attempt, config(), timers.value)

    expect(timers.waits).toEqual([1_000])
  })

  it('clamps an oversized Retry-After to the configured ceiling', async () => {
    const attempt = vi
      .fn<(index: number) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'Retry-After': '600' } }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const timers = hooks()

    await withProviderResilience(
      'openai',
      attempt,
      config({ maxDelayMs: 2_000 }),
      timers.value,
    )

    expect(timers.waits).toEqual([2_000])
  })

  it('cancels a discarded response body so the socket is released', async () => {
    const cancel = vi.fn(async () => undefined)
    const retryable = {
      status: 503,
      headers: new Headers(),
      body: { cancel },
    } as unknown as Response
    const attempt = vi
      .fn<(index: number) => Promise<Response>>()
      .mockResolvedValueOnce(retryable)
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await withProviderResilience('openai', attempt, config(), hooks().value)

    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('retries a transient transport fault', async () => {
    const attempt = vi
      .fn<(index: number) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const timers = hooks()

    const response = await withProviderResilience('openai', attempt, config(), timers.value)

    expect(response.status).toBe(200)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('rethrows a transport fault once the budget is spent', async () => {
    const attempt = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(
      withProviderResilience('openai', attempt, config({ retries: 1 }), hooks().value),
    ).rejects.toThrow('fetch failed')
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('never retries an endpoint policy rejection', async () => {
    const attempt = vi.fn(async () => {
      throw Object.assign(new Error('blocked'), {
        code: PROVIDER_ENDPOINT_ERROR_CODE,
        name: 'ProviderEndpointError',
      })
    })

    await expect(
      withProviderResilience('openai', attempt, config(), hooks().value),
    ).rejects.toThrow('blocked')
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(breakerStateFor('openai', config().breaker, 1_000_000)).toBe('closed')
  })

  it('never retries a caller abort', async () => {
    const attempt = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })

    await expect(
      withProviderResilience('openai', attempt, config(), hooks().value),
    ).rejects.toThrow('aborted')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('stops before dialing when the caller signal is already aborted', async () => {
    const attempt = vi.fn(async () => new Response('ok', { status: 200 }))
    const controller = new AbortController()
    controller.abort()

    await expect(
      withProviderResilience('openai', attempt, config(), hooks().value, controller.signal),
    ).rejects.toThrow()
    expect(attempt).not.toHaveBeenCalled()
  })

  it('reports each retry through the diagnostics hook', async () => {
    const onRetry = vi.fn()
    const attempt = vi
      .fn<(index: number) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    await withProviderResilience('openai', attempt, config(), {
      ...hooks().value,
      onRetry,
    })

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith({
      provider: 'openai',
      attempt: 1,
      delayMs: 100,
      reason: 'status',
      status: 503,
    })
  })

  it('does not retry at all when the budget is zero', async () => {
    const attempt = vi.fn(async () => new Response('down', { status: 503 }))

    const response = await withProviderResilience(
      'openai',
      attempt,
      config({ retries: 0, breaker: { enabled: false, failureThreshold: 3, openMs: 1_000 } }),
      hooks().value,
    )

    expect(response.status).toBe(503)
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})

describe('circuit breaker', () => {
  const breaker = config().breaker

  it('opens after the configured number of consecutive failures', () => {
    expect(breakerStateFor('openai', breaker, 1_000)).toBe('closed')
    recordBreakerFailure('openai', breaker, 1_000)
    recordBreakerFailure('openai', breaker, 1_000)
    expect(breakerStateFor('openai', breaker, 1_000)).toBe('closed')
    recordBreakerFailure('openai', breaker, 1_000)
    expect(breakerStateFor('openai', breaker, 1_000)).toBe('open')
  })

  it('fails fast with a wait hint while open', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)

    try {
      assertBreakerAllowsRequest('openai', breaker, 2_000)
      expect.unreachable('expected the open breaker to reject the request')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderCircuitOpenError)
      expect((error as ProviderCircuitOpenError).status).toBe(503)
      expect((error as ProviderCircuitOpenError).code).toBe('PROVIDER_CIRCUIT_OPEN')
      expect((error as ProviderCircuitOpenError).retryAfterSeconds).toBe(29)
    }
  })

  it('isolates providers from one another', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)

    expect(breakerStateFor('openai', breaker, 1_000)).toBe('open')
    expect(breakerStateFor('anthropic', breaker, 1_000)).toBe('closed')
    expect(() => assertBreakerAllowsRequest('anthropic', breaker, 1_000)).not.toThrow()
  })

  it('a success resets the failure run', () => {
    recordBreakerFailure('openai', breaker, 1_000)
    recordBreakerFailure('openai', breaker, 1_000)
    recordBreakerSuccess('openai', breaker)
    recordBreakerFailure('openai', breaker, 1_000)

    expect(breakerStateFor('openai', breaker, 1_000)).toBe('closed')
  })

  it('admits exactly one trial request when half-open', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)
    const afterWindow = 1_000 + breaker.openMs

    expect(breakerStateFor('openai', breaker, afterWindow)).toBe('half-open')
    expect(() => assertBreakerAllowsRequest('openai', breaker, afterWindow)).not.toThrow()
    expect(() => assertBreakerAllowsRequest('openai', breaker, afterWindow)).toThrow(
      ProviderCircuitOpenError,
    )
  })

  it('closes on a successful trial', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)
    const afterWindow = 1_000 + breaker.openMs
    assertBreakerAllowsRequest('openai', breaker, afterWindow)
    recordBreakerSuccess('openai', breaker)

    expect(breakerStateFor('openai', breaker, afterWindow)).toBe('closed')
    expect(() => assertBreakerAllowsRequest('openai', breaker, afterWindow)).not.toThrow()
  })

  it('re-opens immediately when the trial fails', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)
    const afterWindow = 1_000 + breaker.openMs
    assertBreakerAllowsRequest('openai', breaker, afterWindow)
    recordBreakerFailure('openai', breaker, afterWindow)

    expect(breakerStateFor('openai', breaker, afterWindow)).toBe('open')
  })

  it('is a no-op in every direction when disabled', () => {
    const disabled = { enabled: false, failureThreshold: 1, openMs: 1_000 }
    recordBreakerFailure('openai', disabled, 1_000)
    recordBreakerFailure('openai', disabled, 1_000)

    expect(breakerStateFor('openai', disabled, 1_000)).toBe('closed')
    expect(() => assertBreakerAllowsRequest('openai', disabled, 1_000)).not.toThrow()
    expect(providerBreakerSnapshot(disabled, 1_000)).toEqual([])
  })

  it('opens through the orchestrator once failures accumulate', async () => {
    const settings = config({
      retries: 0,
      breaker: { enabled: true, failureThreshold: 2, openMs: 30_000 },
    })
    const attempt = vi.fn(async () => new Response('down', { status: 503 }))

    await withProviderResilience('grok', attempt, settings, hooks().value)
    await withProviderResilience('grok', attempt, settings, hooks().value)

    await expect(
      withProviderResilience('grok', attempt, settings, hooks().value),
    ).rejects.toBeInstanceOf(ProviderCircuitOpenError)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('does not trip on a user credential error', async () => {
    const settings = config({
      retries: 0,
      breaker: { enabled: true, failureThreshold: 2, openMs: 30_000 },
    })
    const attempt = vi.fn(async () => new Response('bad key', { status: 401 }))

    await withProviderResilience('grok', attempt, settings, hooks().value)
    await withProviderResilience('grok', attempt, settings, hooks().value)
    await withProviderResilience('grok', attempt, settings, hooks().value)

    expect(attempt).toHaveBeenCalledTimes(3)
    expect(breakerStateFor('grok', settings.breaker, 1_000_000)).toBe('closed')
  })

  it('releases the half-open trial slot when the caller aborts', async () => {
    // Regression: an unscored trial used to leave `trialInFlight` set, and
    // since only a scored outcome clears it the breaker then rejected every
    // later request for that provider for good.
    const settings = config({
      retries: 0,
      breaker: { enabled: true, failureThreshold: 1, openMs: 30_000 },
    })
    recordBreakerFailure('openai', settings.breaker, 1_000)
    const afterWindow = 1_000 + settings.breaker.openMs
    const timers = { ...hooks().value, now: () => afterWindow }

    const aborting = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(
      withProviderResilience('openai', aborting, settings, timers),
    ).rejects.toThrow('aborted')

    // The breaker is still half-open, so the next request gets the trial slot.
    const healthy = vi.fn(async () => new Response('ok', { status: 200 }))
    const response = await withProviderResilience('openai', healthy, settings, timers)

    expect(response.status).toBe(200)
    expect(healthy).toHaveBeenCalledTimes(1)
    expect(breakerStateFor('openai', settings.breaker, afterWindow)).toBe('closed')
  })

  it('releases the trial slot on an endpoint policy rejection', async () => {
    const settings = config({
      retries: 0,
      breaker: { enabled: true, failureThreshold: 1, openMs: 30_000 },
    })
    recordBreakerFailure('openai', settings.breaker, 1_000)
    const afterWindow = 1_000 + settings.breaker.openMs
    const timers = { ...hooks().value, now: () => afterWindow }

    const blocked = vi.fn(async () => {
      throw Object.assign(new Error('blocked'), { name: 'ProviderEndpointError' })
    })
    await expect(
      withProviderResilience('openai', blocked, settings, timers),
    ).rejects.toThrow('blocked')

    const healthy = vi.fn(async () => new Response('ok', { status: 200 }))
    await expect(
      withProviderResilience('openai', healthy, settings, timers),
    ).resolves.toMatchObject({ status: 200 })
  })

  it('does not score an unrecognised error in either direction', async () => {
    const settings = config({
      retries: 0,
      breaker: { enabled: true, failureThreshold: 2, openMs: 30_000 },
    })
    recordBreakerFailure('openai', settings.breaker, 1_000)

    const odd = vi.fn(async () => {
      throw new Error('something unclassifiable')
    })
    await expect(
      withProviderResilience('openai', odd, settings, hooks().value),
    ).rejects.toThrow('something unclassifiable')

    // Neither incremented toward opening nor reset the existing run.
    expect(providerBreakerSnapshot(settings.breaker, 1_000)[0]).toMatchObject({
      provider: 'openai',
      consecutiveFailures: 1,
      state: 'closed',
    })
  })

  it('abandons its remaining retries once the breaker opens mid-sequence', async () => {
    const settings = config({
      retries: 5,
      breaker: { enabled: true, failureThreshold: 2, openMs: 30_000 },
    })
    const attempt = vi.fn(async () => new Response('down', { status: 503 }))
    const timers = hooks()

    const response = await withProviderResilience(
      'openai',
      attempt,
      settings,
      timers.value,
    )

    // Two failures reach the threshold; the budget of five is not spent on an
    // upstream that was just declared unhealthy.
    expect(response.status).toBe(503)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(breakerStateFor('openai', settings.breaker, 1_000_000)).toBe('open')
  })

  it('exposes a credential-free diagnostic snapshot', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)
    recordBreakerFailure('anthropic', breaker, 1_000)

    const snapshot = providerBreakerSnapshot(breaker, 2_000)

    expect(snapshot).toEqual([
      {
        provider: 'anthropic',
        state: 'closed',
        consecutiveFailures: 1,
        openedAt: null,
        retryAfterSeconds: null,
      },
      {
        provider: 'openai',
        state: 'open',
        consecutiveFailures: 3,
        openedAt: new Date(1_000).toISOString(),
        retryAfterSeconds: 29,
      },
    ])
    expect(JSON.stringify(snapshot)).not.toMatch(/sk-|api[-_]?key/i)
  })

  it('resets a single provider or the whole store', () => {
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('openai', breaker, 1_000)
    for (let i = 0; i < 3; i += 1) recordBreakerFailure('kimi', breaker, 1_000)

    resetProviderBreakers('openai')
    expect(breakerStateFor('openai', breaker, 1_000)).toBe('closed')
    expect(breakerStateFor('kimi', breaker, 1_000)).toBe('open')

    resetProviderBreakers()
    expect(breakerStateFor('kimi', breaker, 1_000)).toBe('closed')
  })
})

describe('providerFetch integration', () => {
  const url = 'https://api.openai.com/v1/chat/completions'

  it('performs exactly one dial with the ambient test defaults', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }))

    const response = await providerFetch('openai', url, {}, { fetchImpl })

    expect(response.status).toBe(503)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries through providerFetch when a budget is configured', async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const timers = hooks()

    const response = await providerFetch(
      'openai',
      url,
      {},
      { fetchImpl, resilience: config(), resilienceHooks: timers.value },
    )

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(timers.waits).toEqual([100])
  })

  it('still rejects a redirect without retrying it', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example.test/' },
        }),
    )

    await expect(
      providerFetch(
        'openai',
        url,
        {},
        { fetchImpl, resilience: config(), resilienceHooks: hooks().value },
      ),
    ).rejects.toMatchObject({ code: PROVIDER_ENDPOINT_ERROR_CODE })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails fast through providerFetch once the breaker is open', async () => {
    const settings = config({
      retries: 0,
      breaker: { enabled: true, failureThreshold: 1, openMs: 30_000 },
    })
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }))

    await providerFetch(
      'openai',
      url,
      {},
      { fetchImpl, resilience: settings, resilienceHooks: hooks().value },
    )

    await expect(
      providerFetch(
        'openai',
        url,
        {},
        { fetchImpl, resilience: settings, resilienceHooks: hooks().value },
      ),
    ).rejects.toBeInstanceOf(ProviderCircuitOpenError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
