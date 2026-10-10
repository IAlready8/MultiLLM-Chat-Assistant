/**
 * Provider resilience: bounded retry plus a per-provider circuit breaker.
 *
 * WHY THIS EXISTS
 * ---------------
 * `providerFetch` in `lib/provider-endpoint.ts` is the single chokepoint for
 * every outbound provider HTTP call (all nine adapters, both the chat and the
 * stream route, plus credential probes). Before this module there was no
 * retry on transient upstream failures and no breaker, so a provider having a
 * bad minute surfaced directly to the user as a failed generation, and a
 * provider that was hard down was still dialed on every single request.
 *
 * WHAT IS RETRIED
 * ---------------
 * Only failures that are safe to repeat and plausibly transient:
 *   - network-level errors (fetch rejection: ECONNRESET, EAI_AGAIN, ...)
 *   - HTTP 429 (honouring `Retry-After` when the upstream sends it)
 *   - HTTP 408, 425, 500, 502, 503, 504
 *
 * WHAT IS NEVER RETRIED
 * ---------------------
 *   - 4xx other than the three above (auth, validation, model errors): a
 *     repeat produces the same answer and wastes the user's quota
 *   - `ProviderEndpointError` (SSRF guard) and any redirect rejection: these
 *     are policy decisions, not transient faults
 *   - anything after the caller's `AbortSignal` has fired
 *   - anything once response bytes may have reached the client
 *
 * The retry sits *before* the response body is consumed. `providerFetch`
 * returns the `Response` to the adapter, which only then starts reading the
 * SSE/NDJSON stream. So a retried attempt can never duplicate tokens that a
 * user already saw: at retry time nothing has been streamed. That ordering is
 * the correctness argument for retrying streaming calls at all, and it is why
 * this module must stay inside `providerFetch` rather than wrapping an
 * adapter's generator.
 *
 * BILLABILITY
 * -----------
 * A retried request that the upstream already began processing can be billed
 * twice by the provider. That is why the retry budget is small, applies only
 * to the classes above, and defaults to 2 extra attempts.
 *
 * CIRCUIT BREAKER
 * ---------------
 * State is per `provider` string and lives in this process (keyed on
 * `globalThis` so Next.js module reloads in development do not reset it).
 * It is deliberately NOT distributed: a breaker is a latency optimisation and
 * a politeness measure toward upstreams, not a correctness mechanism, so
 * per-instance state is the right trade-off and needs no Redis or Postgres
 * dependency. Rate limiting, which does need to be global, already has its
 * own distributed implementation in `lib/rate-limit.ts`.
 *
 *   closed    -> normal operation; consecutive transient failures counted
 *   open      -> fail fast for `openMs`, no upstream dial at all
 *   half-open -> exactly one trial request allowed; success closes the
 *                breaker, failure re-opens it
 *
 * Only transient failures move the breaker. A user's bad API key (401) must
 * never trip a breaker that would then block every other user of that
 * provider on this instance.
 *
 * CONFIGURATION
 * -------------
 * `LLM_FETCH_RETRIES`      extra attempts after the first (default 2, max 5)
 * `LLM_FETCH_RETRY_BASE_MS` first backoff step in ms (default 250)
 * `LLM_FETCH_RETRY_MAX_MS`  backoff ceiling in ms (default 4000)
 * `PROVIDER_BREAKER_ENABLED`      'false' disables the breaker
 * `PROVIDER_BREAKER_THRESHOLD`    consecutive failures to open (default 5)
 * `PROVIDER_BREAKER_OPEN_MS`      how long to stay open (default 30000)
 *
 * `LLM_FETCH_RETRIES` is an existing name in this repository: it is already
 * read by `services/api-client.ts` and `services/server-api-client.ts`. This
 * module reuses it rather than introducing a competing knob.
 *
 * TEST ENVIRONMENT
 * ----------------
 * Under `NODE_ENV === 'test'` the defaults are 0 retries and a disabled
 * breaker, so the pre-existing provider test suites observe exactly one fetch
 * call per request, as they did before this module existed. `providerFetch`
 * already carries a `NODE_ENV === 'test'` branch for DNS validation, so this
 * follows the established pattern in the file. Tests that target this module
 * pass an explicit config instead of relying on the ambient default.
 */

// ---------------------------------------------------------------------------
// Retry classification
// ---------------------------------------------------------------------------

/**
 * Endpoint-policy marker, matched structurally rather than imported.
 *
 * `lib/provider-endpoint.ts` imports this module, so importing
 * `PROVIDER_ENDPOINT_ERROR_CODE` back from it would create a module cycle.
 * The value is asserted against that module's export by
 * `test/provider-resilience.test.ts`, so the two cannot drift apart silently.
 */
const ENDPOINT_POLICY_ERROR_CODE = 'PROVIDER_ENDPOINT_BLOCKED'
const ENDPOINT_POLICY_ERROR_NAME = 'ProviderEndpointError'

/** HTTP statuses that are safe and worthwhile to repeat. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, // Request Timeout
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
])

/** Substrings that identify a transport-level failure in a thrown error. */
const TRANSIENT_ERROR_PATTERNS: readonly string[] = [
  'fetch failed',
  'network',
  'econnreset',
  'econnrefused',
  'enotfound',
  'eai_again',
  'epipe',
  'ehostunreach',
  'enetunreach',
  'etimedout',
  'socket hang up',
  'terminated',
  'other side closed',
]

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.name === 'TimeoutError'
}

function isEndpointPolicyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ((error as { code?: unknown }).code === ENDPOINT_POLICY_ERROR_CODE) return true
  return (error as { name?: unknown }).name === ENDPOINT_POLICY_ERROR_NAME
}

/**
 * True when a thrown value represents a transport fault worth repeating.
 *
 * Aborts (caller cancellation and request deadlines) and endpoint policy
 * rejections are explicitly excluded: neither improves on a second attempt.
 */
export function isTransientFetchError(error: unknown): boolean {
  if (isAbortError(error)) return false
  if (isEndpointPolicyError(error)) return false
  if (!(error instanceof Error)) return false

  const haystack = `${error.message} ${String(
    (error as { cause?: { code?: unknown } }).cause?.code ?? '',
  )}`.toLowerCase()

  return TRANSIENT_ERROR_PATTERNS.some((pattern) => haystack.includes(pattern))
}

/** True when an upstream response status should be retried. */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status)
}

/**
 * Parse a `Retry-After` header into milliseconds.
 *
 * Accepts both documented forms: delta-seconds and an HTTP date. Returns null
 * for a missing, malformed, or past value. The result is clamped by the caller
 * so a hostile or mistaken upstream cannot stall a request indefinitely.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed)
    if (!Number.isFinite(seconds) || seconds < 0) return null
    return Math.min(seconds, 3600) * 1000
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return null
  const delta = parsed - now
  if (delta <= 0) return null
  return Math.min(delta, 3600 * 1000)
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type ProviderResilienceConfig = {
  /** Extra attempts after the first. 0 disables retrying. */
  retries: number
  /** First backoff step in milliseconds. */
  baseDelayMs: number
  /** Upper bound for any single backoff wait. */
  maxDelayMs: number
  breaker: {
    enabled: boolean
    /** Consecutive transient failures required to open the breaker. */
    failureThreshold: number
    /** How long the breaker stays open before allowing a trial request. */
    openMs: number
  }
}

const MAX_RETRIES = 5

function readInt(value: string | undefined): number | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test'
}

/**
 * Resolve the effective configuration from the environment.
 *
 * Defaults are production-shaped outside tests and inert inside them, so
 * adding this layer changed no pre-existing test expectation.
 */
export function resolveProviderResilienceConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProviderResilienceConfig {
  const inTest = env.NODE_ENV === 'test'
  const retries = readInt(env.LLM_FETCH_RETRIES)
  const baseDelayMs = readInt(env.LLM_FETCH_RETRY_BASE_MS)
  const maxDelayMs = readInt(env.LLM_FETCH_RETRY_MAX_MS)
  const threshold = readInt(env.PROVIDER_BREAKER_THRESHOLD)
  const openMs = readInt(env.PROVIDER_BREAKER_OPEN_MS)

  const breakerEnabledRaw = env.PROVIDER_BREAKER_ENABLED?.trim().toLowerCase()
  const breakerEnabled =
    breakerEnabledRaw === 'true'
      ? true
      : breakerEnabledRaw === 'false'
        ? false
        : !inTest

  return {
    retries: clamp(retries ?? (inTest ? 0 : 2), 0, MAX_RETRIES),
    baseDelayMs: clamp(baseDelayMs ?? 250, 10, 10_000),
    maxDelayMs: clamp(maxDelayMs ?? 4_000, 10, 60_000),
    breaker: {
      enabled: breakerEnabled,
      failureThreshold: clamp(threshold ?? 5, 1, 100),
      openMs: clamp(openMs ?? 30_000, 1_000, 600_000),
    },
  }
}

/**
 * Backoff for a given attempt: exponential with full jitter.
 *
 * Full jitter (a uniform draw over the whole window rather than a fixed step
 * plus noise) is what stops a set of concurrent generations against one
 * provider from retrying in lockstep and re-creating the spike that caused
 * the failure.
 */
export function backoffDelayMs(
  attempt: number,
  config: Pick<ProviderResilienceConfig, 'baseDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number {
  const exponential = config.baseDelayMs * Math.pow(2, Math.max(0, attempt))
  const window = Math.min(exponential, config.maxDelayMs)
  return Math.round(window * random())
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type BreakerState = 'closed' | 'open' | 'half-open'

type BreakerEntry = {
  consecutiveFailures: number
  openedAt: number | null
  /** Set while a half-open trial request is in flight. */
  trialInFlight: boolean
}

type BreakerGlobal = typeof globalThis & {
  __multiLlmProviderBreakers?: Map<string, BreakerEntry>
}

const breakerGlobal = globalThis as BreakerGlobal

function breakerStore(): Map<string, BreakerEntry> {
  if (!breakerGlobal.__multiLlmProviderBreakers) {
    breakerGlobal.__multiLlmProviderBreakers = new Map()
  }
  return breakerGlobal.__multiLlmProviderBreakers
}

function breakerEntry(provider: string): BreakerEntry {
  const store = breakerStore()
  const existing = store.get(provider)
  if (existing) return existing
  const created: BreakerEntry = {
    consecutiveFailures: 0,
    openedAt: null,
    trialInFlight: false,
  }
  store.set(provider, created)
  return created
}

/** Raised instead of dialing an upstream whose breaker is open. */
export class ProviderCircuitOpenError extends Error {
  readonly code = 'PROVIDER_CIRCUIT_OPEN'
  readonly status = 503

  constructor(
    readonly provider: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      `Provider ${provider} is temporarily unavailable after repeated failures. Retry in ${retryAfterSeconds}s.`,
    )
    this.name = 'ProviderCircuitOpenError'
  }
}

/**
 * Current breaker state for a provider, without mutating anything.
 *
 * `openMs` having elapsed is what turns `open` into `half-open`; the
 * transition is computed on read rather than on a timer so the breaker needs
 * no background work and no cleanup.
 */
export function breakerStateFor(
  provider: string,
  config: ProviderResilienceConfig['breaker'],
  now: number = Date.now(),
): BreakerState {
  if (!config.enabled) return 'closed'
  const entry = breakerStore().get(provider)
  if (!entry || entry.openedAt === null) return 'closed'
  return now - entry.openedAt >= config.openMs ? 'half-open' : 'open'
}

/**
 * Admission check. Throws `ProviderCircuitOpenError` while the breaker is
 * open, marks the trial in flight when it is half-open, and is a no-op when
 * closed or disabled.
 */
export function assertBreakerAllowsRequest(
  provider: string,
  config: ProviderResilienceConfig['breaker'],
  now: number = Date.now(),
): void {
  if (!config.enabled) return
  const entry = breakerStore().get(provider)
  if (!entry || entry.openedAt === null) return

  const elapsed = now - entry.openedAt
  if (elapsed < config.openMs) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((config.openMs - elapsed) / 1000),
    )
    throw new ProviderCircuitOpenError(provider, retryAfterSeconds)
  }

  // Half-open: admit exactly one trial request and hold the rest off until it
  // settles, so a provider that is still down takes one probe rather than a
  // thundering herd.
  if (entry.trialInFlight) {
    throw new ProviderCircuitOpenError(
      provider,
      Math.max(1, Math.ceil(config.openMs / 1000)),
    )
  }
  entry.trialInFlight = true
}

/**
 * Release a half-open trial slot without scoring it.
 *
 * Needed because a trial can end without a verdict: the caller aborts, the
 * request deadline fires, or the endpoint guard rejects the target. Without
 * this the `trialInFlight` flag would stay set, and since only a scored
 * outcome clears it the breaker would refuse every later request for that
 * provider indefinitely. Counters are left untouched: an unscored attempt is
 * evidence of nothing either way.
 */
export function releaseBreakerTrial(
  provider: string,
  config: ProviderResilienceConfig['breaker'],
): void {
  if (!config.enabled) return
  const entry = breakerStore().get(provider)
  if (entry) entry.trialInFlight = false
}

/** Record a successful (non-transient) outcome; closes the breaker. */
export function recordBreakerSuccess(
  provider: string,
  config: ProviderResilienceConfig['breaker'],
): void {
  if (!config.enabled) return
  const entry = breakerEntry(provider)
  entry.consecutiveFailures = 0
  entry.openedAt = null
  entry.trialInFlight = false
}

/**
 * Record a transient failure. Opens the breaker once the threshold is met,
 * and re-opens immediately when a half-open trial fails.
 */
export function recordBreakerFailure(
  provider: string,
  config: ProviderResilienceConfig['breaker'],
  now: number = Date.now(),
): void {
  if (!config.enabled) return
  const entry = breakerEntry(provider)

  if (entry.trialInFlight) {
    entry.trialInFlight = false
    entry.openedAt = now
    entry.consecutiveFailures = Math.max(
      entry.consecutiveFailures,
      config.failureThreshold,
    )
    return
  }

  entry.consecutiveFailures += 1
  if (entry.consecutiveFailures >= config.failureThreshold) {
    entry.openedAt = now
  }
}

/**
 * Drop all breaker state.
 *
 * Exported for tests and for the admin status surface; never called from a
 * request path.
 */
export function resetProviderBreakers(provider?: string): void {
  if (provider === undefined) {
    breakerStore().clear()
    return
  }
  breakerStore().delete(provider)
}

export type ProviderBreakerSnapshot = {
  provider: string
  state: BreakerState
  consecutiveFailures: number
  openedAt: string | null
  retryAfterSeconds: number | null
}

/**
 * Read-only view of every tracked breaker, for diagnostics.
 *
 * Contains no credentials and no user data: provider id, state and counters
 * only, so it is safe to expose on an operator surface.
 */
export function providerBreakerSnapshot(
  config: ProviderResilienceConfig['breaker'] = resolveProviderResilienceConfig()
    .breaker,
  now: number = Date.now(),
): ProviderBreakerSnapshot[] {
  const snapshots: ProviderBreakerSnapshot[] = []
  for (const [provider, entry] of breakerStore()) {
    const open = entry.openedAt !== null && now - entry.openedAt < config.openMs
    const halfOpen =
      entry.openedAt !== null && now - entry.openedAt >= config.openMs
    snapshots.push({
      provider,
      state: open ? 'open' : halfOpen ? 'half-open' : 'closed',
      consecutiveFailures: entry.consecutiveFailures,
      openedAt: entry.openedAt === null ? null : new Date(entry.openedAt).toISOString(),
      retryAfterSeconds:
        open && entry.openedAt !== null
          ? Math.max(1, Math.ceil((config.openMs - (now - entry.openedAt)) / 1000))
          : null,
    })
  }
  return snapshots.sort((left, right) => left.provider.localeCompare(right.provider))
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type ResilientFetchHooks = {
  /** Called before each backoff wait. Diagnostics only. */
  onRetry?: (info: {
    provider: string
    attempt: number
    delayMs: number
    reason: 'status' | 'network'
    status?: number
  }) => void
  /** Injectable sleep, for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Injectable jitter source, for tests. */
  random?: () => number
  now?: () => number
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new DOMException('The operation was aborted.', 'AbortError'),
      )
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Run a single provider attempt under the retry budget and the breaker.
 *
 * `attempt` performs exactly one upstream dial and must not consume the
 * response body: a retryable response is discarded here (its body is
 * cancelled to free the socket) and the caller only ever receives a response
 * it is meant to read.
 */
export async function withProviderResilience(
  provider: string,
  attempt: (attemptIndex: number) => Promise<Response>,
  config: ProviderResilienceConfig,
  hooks: ResilientFetchHooks = {},
  signal?: AbortSignal,
): Promise<Response> {
  const sleep = hooks.sleep ?? defaultSleep
  const random = hooks.random ?? Math.random
  const now = hooks.now ?? Date.now

  assertBreakerAllowsRequest(provider, config.breaker, now())

  let lastError: unknown = null
  // Whether this request produced a verdict the breaker has already scored.
  let scored = false

  try {
    for (let index = 0; index <= config.retries; index += 1) {
      signal?.throwIfAborted()

      let response: Response | null = null
      try {
        response = await attempt(index)
      } catch (error) {
        // A policy rejection or a cancellation is final: report it unchanged
        // and leave the counters alone, since neither reflects provider health.
        if (isEndpointPolicyError(error) || isAbortError(error)) throw error

        // An unrecognised error is not scored either: incrementing on it could
        // open the breaker for a fault that is not the provider's, and
        // resetting on it could stop the breaker from ever opening.
        if (!isTransientFetchError(error)) throw error

        lastError = error
        recordBreakerFailure(provider, config.breaker, now())
        scored = true

        if (index === config.retries) throw error
        // The breaker opening mid-sequence ends the sequence: continuing to
        // dial an upstream that was just declared unhealthy is what the
        // breaker exists to prevent.
        if (breakerStateFor(provider, config.breaker, now()) === 'open') throw error

        const delayMs = backoffDelayMs(index, config, random)
        hooks.onRetry?.({ provider, attempt: index + 1, delayMs, reason: 'network' })
        await sleep(delayMs, signal)
        continue
      }

      if (!isRetryableStatus(response.status)) {
        // Any definite answer, success or client error, means the provider is
        // reachable and answering. That is what the breaker tracks.
        recordBreakerSuccess(provider, config.breaker)
        scored = true
        return response
      }

      recordBreakerFailure(provider, config.breaker, now())
      scored = true

      if (index === config.retries) return response
      if (breakerStateFor(provider, config.breaker, now()) === 'open') return response

      const retryAfterMs = parseRetryAfterMs(
        response.headers?.get('retry-after'),
        now(),
      )
      const delayMs =
        retryAfterMs === null
          ? backoffDelayMs(index, config, random)
          : Math.min(retryAfterMs, config.maxDelayMs)

      hooks.onRetry?.({
        provider,
        attempt: index + 1,
        delayMs,
        reason: 'status',
        status: response.status,
      })

      // Release the upstream socket before waiting; the body is never surfaced.
      await response.body?.cancel().catch(() => undefined)
      await sleep(delayMs, signal)
    }

    // Unreachable: the loop either returns or throws on its final iteration.
    throw lastError instanceof Error
      ? lastError
      : new Error(`Provider ${provider} request failed`)
  } finally {
    // An unscored exit must not strand a half-open trial slot, or the breaker
    // would reject every later request for this provider forever.
    if (!scored) releaseBreakerTrial(provider, config.breaker)
  }
}
