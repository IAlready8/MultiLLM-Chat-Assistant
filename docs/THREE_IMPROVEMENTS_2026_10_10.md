# Three Integrated Improvements - 2026-10-10

Integration record for three additive improvements landed on top of
`main` at `2cd8fc1`. Written to the reporting standard in `CLAUDE.md`:
OBSERVED, VERIFIED IN THIS SESSION, UNVERIFIED, BLOCKERS, NEXT ACTIONS are
kept separate.

## Constraint this work was done under

Build on the existing codebase only. No rewrite, no re-architecture, no
removed behaviour, no schema migration, no new infrastructure dependency,
and no change to any pre-existing test expectation.

## Improvement 1: provider resilience at the outbound chokepoint

### OBSERVED

- `providerFetch` in `lib/provider-endpoint.ts` is the single outbound path
  for all nine provider adapters, both LLM routes, and credential probes.
- It performed exactly one dial, with no retry and no breaker. A provider
  having a bad minute surfaced directly to the user as a failed generation.
- `lib/circuit-breaker.ts` and `lib/api/circuit-breaker.ts` both existed and
  were imported by nothing on any request path.
- `LLM_FETCH_RETRIES` was already read by `services/api-client.ts` and
  `services/server-api-client.ts`, so the knob existed without a retry
  implementation behind the provider calls.

### What was added

`lib/provider-resilience.ts`, wired into `providerFetch`.

- Bounded retry, default 2 extra attempts, hard maximum 5.
- Exponential backoff with full jitter, so concurrent generations against one
  provider do not retry in lockstep and recreate the spike.
- `Retry-After` honoured when the upstream sends it, in both the
  delta-seconds and HTTP-date forms, clamped to the configured ceiling.
- Retried: 408, 425, 429, 500, 502, 503, 504 and transport faults.
- Never retried: other 4xx, endpoint policy rejections, redirect rejections,
  caller aborts, request deadlines, and unclassifiable errors.
- Per-provider circuit breaker with closed, open and half-open states. Only
  transient failures move it, so one user's bad API key cannot open a breaker
  that would block every other user of that provider.
- Half-open admits exactly one trial request; success closes, failure
  re-opens.
- Breaker state is per application instance by design. It is a latency and
  politeness measure, not a correctness mechanism, so it needs no Redis or
  Postgres. Rate limiting, which does need to be global, keeps its existing
  distributed implementation.

### Why retrying is safe for streaming

The retry sits inside `providerFetch`, which returns the `Response` before
any adapter reads the body. At retry time no provider bytes have reached the
client, so a retried attempt cannot duplicate tokens a user already saw. A
retryable response has its body cancelled before the backoff wait, so the
socket is released and the response is never surfaced. This is why the layer
must stay in `providerFetch` and not wrap an adapter's generator.

Retries share the caller's existing deadline (`AbortSignal.timeout(45_000)`
from the routes, threaded through `providerSignal`). The retry budget cannot
extend a request past the route deadline or the `maxDuration` ceiling.

### Billability

A retried request the upstream already began processing can be billed twice.
That is why the budget is small, applies only to the classes above, and
stops early once the breaker opens mid-sequence.

### Defect found and fixed during review

An unscored half-open trial (caller abort, request deadline, or endpoint
policy rejection) left the `trialInFlight` flag set. Only a scored outcome
cleared it, so the breaker would have rejected every later request for that
provider indefinitely. `releaseBreakerTrial` plus a `finally` guard now
release an unscored trial without touching the counters. Covered by
`releases the half-open trial slot when the caller aborts` and
`releases the trial slot on an endpoint policy rejection`.

### Test-environment behaviour

Under `NODE_ENV=test` the defaults are 0 retries and a disabled breaker.
Pre-existing provider suites assert `toHaveBeenCalledTimes(1)` against
transient statuses, and those assertions still hold unchanged. The file
already carried a `NODE_ENV === 'test'` branch for DNS validation, so this
follows the established pattern. Tests targeting the new layer pass an
explicit config rather than relying on the ambient default, so the logic is
fully exercised in CI.

## Improvement 2: per-model cost accounting from durable generation rows

### OBSERVED

- `lib/provider-pricing.ts` held one blended USD-per-1M-tokens rate per
  provider and applied it to a single combined token total.
- Output tokens cost several times more than input tokens on every major
  provider, so a blended rate on a combined total misreports any workload
  whose mix differs from the assumed average.
- One rate per provider cannot separate a provider's small and flagship
  models, which differ by more than an order of magnitude. That is
  misleading precisely where a comparison tool's value lies.
- `/api/analytics` derived token totals from `Analytics` event payloads.
  Those are best-effort: `recordLlmEvent` swallows its own failures by
  design, and the reader falls back to `content.length / 4` when a payload
  carries no token fields.
- `Generation` rows already stored `promptTokens`, `completionTokens` and
  `usageSource`, written in the same transaction as the assistant message,
  and nothing read them for cost.

### What was added

- `lib/model-pricing.ts`: per-model input and output rates covering every
  non-deprecated model in `lib/model-catalog.ts`, with per-provider fallback
  rates and a reported `precision` of `model` or `provider-fallback`.
  Resolution order is exact model, undated model alias, provider fallback,
  mid-market default. Ollama resolves to zero.
- `services/generation-cost-service.ts`: aggregates durable `Generation`
  rows per provider and model for a window, under a
  `MAX_GENERATION_COST_ROWS` bound, reporting `truncated` when the window is
  partial and `providerReportedShare` so a figure built mostly from estimated
  counts is visibly weaker.
- Additive `costBreakdown` on `/api/analytics` and a "Recorded Spend by
  Model" panel on `/analytics`.

### Compatibility

`lib/provider-pricing.ts` is untouched and still backs
`providerData[].estimatedCostUsd` and `estimatedCostBasis`. No field was
removed or repurposed. The "Est. Cost" tile prefers the durable figure and
falls back to the blended one when the durable read is degraded, so the tile
never goes blank.

A read failure returns `degraded: true` with `empty: false`, and the panel
says the records could not be read rather than presenting a false zero.

## Improvement 3: server-side conversation history search

### OBSERVED

- The paginated conversation listing supported only a workspace title-prefix
  filter and a 30-item keyset page.
- The multi-chat sidebar offered "Recent Conversations" and a Load more
  button, with no way to find a conversation beyond the loaded pages.
- The locked ICP in `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md` is
  consultants re-running client briefs and preserving history to improve
  repeatability. Finding a past comparison is core to that workflow.

### What was added

- `parseConversationSearch` and a `search` field on `parseConversationPage`,
  with whitespace collapsing and a 128-character cap.
- Search in `ConversationService.getConversationPage` matching the title or
  any message body, case-insensitively. The message arm resolves conversation
  ids first under `MAX_SEARCH_MATCH_CONVERSATIONS`, so a broad term stays a
  bounded two-query lookup instead of fanning out across every message.
- `q` on `GET /api/conversations`, routed to the paginated branch so a search
  result set is never served from the cached full-list response.
- A search field in the multi-chat sidebar. The applied term is held in a ref
  so `refreshConversationList` keeps a stable identity; every existing
  refresh path (initial load, save, rename, delete, Load more) stays inside
  the active filter instead of silently dropping back to the full list.

### Deliberately not done

No schema change and no `pg_trgm` extension. A substring match cannot use a
btree index, so the correct index for this is a `pg_trgm` GIN index on
`Message.content`. That needs `CREATE EXTENSION` privileges, which would
break deploys on a database where the app role lacks them. The bounded scan
is the safe version; the index is the follow-up, and it is a schema change
that belongs in its own pass.

Ownership is enforced on both arms: the message lookup is scoped by
`conversation: { userId }` and the conversation query by `userId`. Covered by
`scopes the message arm to the owner, never across users`.

## VERIFIED IN THIS SESSION

Commands run against this working tree, all exit 0:

| Check | Result |
|---|---|
| `npm run type-check` | pass |
| `npm run lint` (`--max-warnings=0`) | pass |
| `npm run test:run` | 92 files, 790 tests, all pass |
| `npm run build` | pass, all routes compiled |
| `npm run check:hygiene` | secret and artifact checks pass |

Baseline before these changes was 86 files and 679 tests. After: 92 files and
790 tests. The 679 pre-existing tests pass unchanged and none were edited.
111 tests were added:

- `test/provider-resilience.test.ts` (46)
- `test/model-pricing.test.ts` (19)
- `test/generation-cost-service.test.ts` (14)
- `test/conversation-search.test.ts` (20)
- `test/api-conversations-search-route.test.ts` (8)
- `test/api-analytics-cost-breakdown.test.ts` (4)

Packaging was verified end to end: the archive was extracted into a clean
directory, type-checked standalone, and the 111 new tests were re-run from
the extracted copy. The no-overwrite path was exercised by packaging the same
name twice, producing `fixed-name.zip` and `fixed-name-1.zip` with identical
SHA-256 values, which also demonstrates the archive is reproducible.

## UNVERIFIED

- Live retry and breaker behaviour against a real provider outage. The logic
  is covered by unit tests with injected timers; no real upstream was failed.
- Search latency on a history larger than `MAX_SEARCH_MATCH_CONVERSATIONS`.
- Cost figures against a real provider invoice. The rates are published list
  prices and exclude discounts, cached-input pricing, batch tiers and
  surcharges. The module and every surface label the figure an estimate.
- Playwright end-to-end specs were not run in this environment.
- `npm run smoke` and `npm run verify:prod` were not run; both need a live
  PostgreSQL instance.

## BLOCKERS

None for the code. Two environment notes, neither caused by these changes:

- `npm ci` fails its `postinstall` in a network-restricted environment
  because the Prisma schema engine binary download is blocked. Worked around
  for verification with `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true
  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate`. CI with
  normal network access is unaffected.
- `main` is protected and the repository's own working rules keep it
  read-only for normal development, so this work is committed on a branch
  for review rather than pushed to `main` directly.

## NEXT ACTIONS

1. Review the branch and open a pull request into `main` so the
   `Quality Checks` and `Smoke Tests` gates run against a live PostgreSQL
   and Redis.
2. Run `npm run smoke` and `npm run verify:prod` against staging, then
   `bash scripts/reliability-check.sh` to confirm the breaker behaves as the
   Step 8 reliability contract in `docs/RELIABILITY_SLOS.md` expects.
3. Consider exposing `providerBreakerSnapshot()` on `/api/admin/status`. The
   snapshot is credential-free and asserted to be so, but adding it is an
   operator-surface change and was left out of this pass.
4. If histories grow past the search bound, denormalise provider and model
   onto `Generation` and add a `pg_trgm` index on `Message.content`, as one
   deliberate schema pass.
