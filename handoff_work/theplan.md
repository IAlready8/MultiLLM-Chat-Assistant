# .plan

goal: move repository to handoff-ready state with zero undocumented ambiguity

## Operating rule
Do everything in dependency order. Do not skip ahead. Update `.currentstatus` after every major checkpoint.

## Progress snapshot (2026-03-03 07:00 EST)
- done:
  - `01.1` Reconfirm repo baseline
  - `01.2` Reconfirm route/page/service/provider inventory
  - `01.3` Reconfirm stale docs and contradictions
  - `02.1` Classify page surface into product/auth/admin groups
  - `02.2` Group all API routes by capability with total=22
  - `02.3` Classify all visible surfaces into core/optional/experimental/remove
  - `02.4` Define acceptance criteria for supported surfaces
  - `03.1` Lock official production runtime shape
  - `03.2` Map required vs optional external systems
  - `03.3` Align production fallback behavior with locked topology
  - `04.1` Classify env vars as required/conditional/optional/dead
  - `04.2` Implement startup validation for required envs
  - `04.3` Align verification script and capture successful end-to-end run
  - `05.1` Rewrite stale top-level status/runtime docs
  - `05.2` Document incomplete subsystems and optional scope honestly
  - `05.3` Establish authoritative documentation set and demote historical docs
  - `06.1` Verify strict-vs-guest auth split with tests and behavior matrix
  - `06.2` Make auth fallback persistence policy explicit and tested
  - `06.3` Verify protected routes via route tests + strict-auth e2e subset
  - `07.1` Confirm Prisma schema + migration reality against runtime usage
  - `07.2` Map DB-first vs fallback behavior and close production read-path fallback leakage in goals/personas
  - `07.3` Remove silent production in-memory persistence dependence; add restart-proof evidence
  - `07.4` Verify migration status/deploy path against production-like verification DB
  - `08.1` Verify provider registry truth and align README provider list with code
  - `08.2` Verify provider config routes in strict+guest modes with deterministic failure handling
  - `08.3` Verify key encryption contract (seed policy, encrypted storage, redaction, server-side decryption path)
  - `08.4` Verify provider-specific failure behavior for chat/stream + error classification
  - `09.1` Verify `/api/llm/chat` contract across required success/failure/auth paths
  - `09.2` Verify `/api/llm/stream` protocol and align NDJSON client consumption
  - `09.3` Verify conversation persistence lifecycle (create/load/list/update/delete + refresh continuity)
  - `09.4` Verify `/multi-chat` page-level flow (loading/empty/success/error/refresh/provider-change)
  - `10.1` Reaffirm sidecar status as optional in locked production topology
  - `10.2` Verify optional sidecar isolation with orchestrate fallback route tests
  - `11.1` Verify Goals feature contract for `/api/goals*` + `/goal-hub`
  - `11.2` Verify Personas feature contract for `/api/personas*` + `/personas`
  - `11.3` Verify Analytics feature contract for `/api/analytics` + `/analytics`
  - `11.4` Verify Comparison feature contract for `/comparison`
  - `11.5` Verify Pipeline feature contract for `/pipeline`
  - `11.6` Demote AI roundtable from supported production scope (experimental-only)
  - `11.7` Verify `/settings` provider configuration management end-to-end
  - `12.1` Verify admin routes truth/auth and close via experimental demotion path
  - `12.2` Close `/api/teams` via explicit removal-from-supported-scope path
  - `12.3` Close billing via optional-feature gate with route/webhook contract tests
  - `12.4` Close webhook verification via optional-feature gate + scripted check semantics
- failed:
  - none
- unverified:
  - runtime/build/test/deploy proof steps not executed yet
- blockers:
  - Python sidecar stream parity still pending (`src/core/main.py` TODO endpoint)

## Phase A - truth locking
1. [x] Reconfirm repo baseline
   - git SHA
   - branch
   - remote
   - runtime versions used
2. [x] Reconfirm route/page/service/provider inventory
3. [x] Reconfirm stale docs and contradictions
4. [x] Produce final supported-scope table:
   - core
   - optional
   - experimental
   - remove

## Locked scope (from 02.3)
- Core: home, auth, chat/stream/conversations, provider settings/config, goals, personas, analytics, health.
- Optional: billing + webhook flow, Python orchestration bridge, API test page.
- Experimental: comparison, pipeline, AI roundtable, admin pages/routes.
- Remove from production scope: `app/api/teams/route.ts`.

## Acceptance baseline (from 02.4)
- Every core/optional surface has explicit minimum behavior + persistence/auth/error criteria in `llminstructions.md`.
- Criteria now map to a locked production topology; next is fallback/code alignment.

## Locked production topology (03.1)
- Postgres required in production.
- Strict auth required in production.
- Stripe optional (billing disabled when env not provided).
- Python sidecar optional (orchestration is non-core).
- Redis optional/out-of-contract for core release acceptance.

## External systems map (03.2)
- Required: Postgres, auth secret, provider credential lifecycle with encryption seed.
- Optional: OAuth providers, Stripe billing, Python sidecar, Redis.

## 03.3 implementation evidence
- Code changes:
  - `lib/demo-account.ts` (production always strict auth; demo bypass disabled in production)
  - `proxy.ts` (strict auth enforced in production)
  - `lib/auth.ts` (in-memory auth fallback disabled in strict/production mode)
  - `lib/prisma.ts` (fail-fast when production has no `DATABASE_URL`)
  - `lib/db-fallback.ts` (block in-memory DB fallback in production)
  - `services/analytics-service.ts` (respect fallback guard)
- Verification commands:
  - `npm run test:run -- test/middleware-auth-routing.test.ts test/db-fallback.test.ts test/analytics-service.test.ts test/api-auth.test.ts`
  - `npm run type-check`

## 04.2 implementation evidence
- Added `lib/startup-validation.ts` and integrated validation calls into `lib/prisma.ts` + `lib/auth.ts`.
- Added tests in `test/startup-validation.test.ts`.
- Verification commands:
  - `npm run test:run -- test/startup-validation.test.ts test/middleware-auth-routing.test.ts test/db-fallback.test.ts test/analytics-service.test.ts test/api-auth.test.ts`
  - `npm run type-check`

## 04.3 status
- Script and doc alignment completed (`scripts/verify-production.sh`, `README.md`, `ARCHITECTURE.md`).
- Successful end-to-end verify proof captured against local Postgres (`multillm_verify_20260302`) with `--apply-migrations`.

## Phase B - runtime lock
5. [x] Decide the official production topology:
   - DB required or not
   - strict auth required or not
   - Stripe in scope or not
   - Python sidecar optional/required/out
6. [x] Classify every env var as:
   - required-all
   - required-conditional
   - optional
   - dead
7. [x] Implement startup validation aligned to chosen topology
8. [x] Align `scripts/verify-production.sh` to the chosen topology

## Phase C - code/docs alignment
9. [x] Rewrite stale docs only after the topology decision is made
10. [x] Replace stale `CLAUDE.md` with the generated version or merge it carefully
11. [x] Update README/architecture/status/completion/python docs so code and docs match

## 05.* implementation evidence
- Rewritten/updated docs:
  - `STATUS_UPDATE.md`
  - `COMPLETION_REPORT.md`
  - `CLAUDE.md`
  - `README.md`
  - `ARCHITECTURE.md`
  - `PYTHON_INTEGRATION.md`
  - `DOCS_SOURCE_OF_TRUTH.md` (new)
- Stale-pattern check command:
  - `rg -n "Next.js 14|12 endpoints|4 providers|100%|FULLY COMPLETE|not integrated with Next.js runtime|Prisma stubs|chore-next16-migration|production-ready" ...`
  - Result: no stale claims in authoritative docs (only historical reference note in `COMPLETION_REPORT.md`).

## 06.1 implementation evidence
- Code/tests updated:
  - `test/demo-account.test.ts` (new)
  - `test/middleware-auth-routing.test.ts` (added production strict-enforcement test)
- Verification commands:
  - `npm run test:run -- test/demo-account.test.ts test/middleware-auth-routing.test.ts test/api-auth.test.ts`
  - `npm run type-check`

## 06.2 implementation evidence
- Code changes:
  - `lib/demo-account.ts` added `isInMemoryAuthFallbackAllowed()`
  - `lib/auth.ts` now uses the policy helper to gate in-memory auth fallback
  - `test/demo-account.test.ts` extended with fallback policy assertions
- Verification commands:
  - `npm run test:run -- test/demo-account.test.ts test/middleware-auth-routing.test.ts test/api-auth.test.ts`
  - `npm run type-check`

## 06.3 implementation evidence
- Updated e2e assertions in `test/e2e/auth-flow.spec.ts` to match strict-auth callback URL behavior and optional OAuth-button presence.
- Verification commands:
  - `npm run test:run -- test/middleware-auth-routing.test.ts test/api-auth.test.ts`
  - `CI=1 AUTH_REQUIRE_LOGIN=true NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true NEXTAUTH_SECRET=... NEXTAUTH_URL=http://localhost:3000 API_KEY_ENCRYPTION_SEED=... npx playwright test test/e2e/auth-flow.spec.ts --project=chromium --grep "redirect unauthenticated users|preserve redirect URL"`
  - strict runtime probe:
    - `/settings` -> `307 /auth/signin?callbackUrl=...`
    - `/api/conversations` -> `401 {"error":"Unauthorized"}`

## 07.1 implementation evidence
- Schema/migration inventory:
  - `prisma/schema.prisma` model list includes all core/optional runtime entities.
  - `prisma/migrations/20260117134259_init` present.
- Usage scan:
  - `rg -n "prisma\\.(...)" app lib services` confirms active model usage paths.
- Migration status command:
  - `DATABASE_URL=postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302 npx prisma migrate status`
  - output: `Database schema is up to date!`

## 07.2 implementation evidence
- Persistence matrix completed for:
  - `lib/api-key-service.ts`
  - `services/conversation-service.db.ts`
  - `services/goal-service.db.ts`
  - `services/persona-service.db.ts`
  - `services/analytics-service.ts`
  - `services/team-service.db.ts`
  - `lib/config-manager.ts`
  - policy anchors: `lib/db-fallback.ts`, `lib/prisma.ts`
- Code hardening applied:
  - `services/goal-service.db.ts`
    - non-creating fallback reads via peek map access
    - fallback operations gated with `db.isFallbackAllowed()`
    - production paths now return DB truth (`null`/`false`) instead of attempting fallback creation
  - `services/persona-service.db.ts`
    - same gating + non-creating fallback reads
- Regression tests added/updated:
  - `test/goal-service-db.test.ts` (production read-path DB-first assertion)
  - `test/persona-service-db.test.ts` (production read-path DB-first assertion)
- Verification commands:
  - `npm run test:run -- test/goal-service-db.test.ts test/persona-service-db.test.ts test/db-fallback.test.ts test/analytics-service.test.ts`
  - `npm run test:run -- test/goal-service-db.test.ts test/persona-service-db.test.ts`
  - `npm run type-check`

## 07.3 implementation evidence
- Production fail-closed code updates:
  - `lib/api-key-service.ts`
  - `services/analytics-service.ts`
  - `services/conversation-service.db.ts`
- Added/updated tests:
  - `test/api-key-service.test.ts` (new)
  - `test/analytics-service.test.ts`
  - `test/conversation-service-db.test.ts`
- Verification commands:
  - `npm run test:run -- test/api-key-service.test.ts test/analytics-service.test.ts test/conversation-service-db.test.ts test/goal-service-db.test.ts test/persona-service-db.test.ts test/db-fallback.test.ts`
  - `npm run type-check`
- Restart-proof evidence:
  - Production-mode process A created DB-backed user/goal/persona/conversation/message.
  - Production-mode process B (new process) read the same records with counts `1/1/1/1`.
  - Temporary proof record cleaned from DB after capture.

## 07.4 implementation evidence
- Verification database:
  - `postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302`
- Commands:
  - `DATABASE_URL=postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302 npx prisma migrate status`
  - `DATABASE_URL=postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302 npx prisma migrate deploy`
  - `DATABASE_URL=postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302 npx prisma migrate status` (recheck)
- Outcome:
  - `Database schema is up to date!`
  - `No pending migrations to apply.`

## 08.1 implementation evidence
- Code truth sources:
  - `lib/providers/registry.ts`
  - `lib/providers/types.ts`
  - `lib/providers/{openai,anthropic,googleai,openrouter,grok}.ts`
- Docs alignment:
  - updated `README.md` highlights with explicit provider list:
    - OpenAI, Anthropic, Google AI, OpenRouter, Grok
  - `CLAUDE.md` already matched code-backed provider set
- Verification commands:
  - `ls -1 lib/providers`
  - `sed -n '1,240p' lib/providers/registry.ts`
  - `sed -n '1,120p' lib/providers/types.ts`
  - `rg -n "Supported providers|OpenAI|Anthropic|Google AI|OpenRouter|Grok" README.md CLAUDE.md`
  - `rg -n "openai|anthropic|googleai|openrouter|grok|supportedProviderIds|ProviderId" lib/providers/registry.ts lib/providers/types.ts`

## 08.2 implementation evidence
- Route hardening changes:
  - `app/api/config/route.ts`
    - explicit `500` for provider-config lookup failure
    - explicit `500` when clearing provider config fails
  - `app/api/test-api-key/route.ts`
    - explicit `500` for unexpected internal test failures
- Route test updates:
  - `test/api-config-route.test.ts`
  - `test/api-provider-configs-route.test.ts`
  - `test/api-test-api-key-route.test.ts`
- Verification commands:
  - `npm run test:run -- test/api-config-route.test.ts test/api-provider-configs-route.test.ts test/api-test-api-key-route.test.ts`
  - `npm run type-check`

## 08.3 implementation evidence
- Code + test updates:
  - `test/api-key-service.test.ts`
    - added encryption contract roundtrip + redaction assertions
  - `app/api/config/route.ts`
    - removed raw error object logging for key operations
  - `app/api/test-api-key/route.ts`
    - removed raw error object logging for key test failures
- Existing enforcement/coverage reused:
  - `lib/runtime-secrets.ts` + `test/runtime-secrets.test.ts`
  - `test/api-provider-configs-route.test.ts` redaction assertion (`apiKey: ''`)
- Verification commands:
  - `npm run test:run -- test/api-key-service.test.ts test/runtime-secrets.test.ts test/api-config-route.test.ts test/api-provider-configs-route.test.ts test/api-test-api-key-route.test.ts`
  - `npm run type-check`

## 08.4 implementation evidence
- Code changes:
  - `lib/providers/errors.ts`
    - added deterministic malformed-provider classification
  - `app/api/llm/chat/route.ts`
    - explicit request JSON parsing branch for `INVALID_JSON`
- Test expansions:
  - `test/api-llm-chat-route.test.ts`
  - `test/api-llm-stream-route.test.ts`
- Verified failure modes:
  - invalid key format
  - missing provider config/key
  - upstream 401
  - upstream 429
  - provider timeout
  - malformed upstream payload/body
- Verification commands:
  - `npm run test:run -- test/api-llm-chat-route.test.ts test/api-llm-stream-route.test.ts`
  - `npm run type-check`

## 09.1 implementation evidence
- Test updates:
  - `test/api-llm-chat-route.test.ts`
    - added guest-mode success path assertion
    - added provider-config DB-failure/internal-error assertion
- Existing chat contract coverage retained:
  - auth forwarding
  - validation failures
  - missing config/key
  - invalid key format
  - upstream 401/429/timeout/malformed
  - non-stream success
- Verification commands:
  - `npm run test:run -- test/api-llm-chat-route.test.ts`
  - `npm run type-check`

## 09.2 implementation evidence
- Contract alignment changes:
  - `app/multi-chat/page.tsx` now consumes `/api/llm/stream` NDJSON events
  - `services/stream-client.ts` endpoint/payload aligned to `/api/llm/stream`
- New/updated tests:
  - `test/api-llm-stream-route.test.ts`
  - `test/stream-client.test.ts` (new)
- Verification commands:
  - `npm run test:run -- test/stream-client.test.ts test/api-llm-stream-route.test.ts`
  - `npm run type-check`

## 09.3 implementation evidence
- Conversation lifecycle implementation updates:
  - `services/conversation-service.db.ts`
    - added `updateConversationTitle()` for rename/update support
  - `app/api/conversations/[id]/route.ts`
    - added `PUT` route with validated title payload and deterministic error handling
  - `lib/api-client.ts`
    - added `updateConversation()` client helper
  - `app/multi-chat/page.tsx`
    - added rename controls in recent conversations
    - added control labels (`aria-label`) for stable UI automation and accessibility
- Tests/evidence updates:
  - `test/api-conversations-routes.test.ts`
    - covers create/load/list/update/delete route behavior
  - `test/conversation-service-db.test.ts`
    - covers lifecycle with rename and reinitialization refresh continuity
  - `test/e2e/conversation-persistence.spec.ts` (new)
    - verifies `/multi-chat` create/load/list/update/delete flow
    - verifies conversation state persists after page reload
- Verification commands:
  - `npm run test:run -- test/api-conversations-routes.test.ts test/conversation-service-db.test.ts`
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/conversation-persistence.spec.ts --project=chromium`
  - `npm run type-check`

## 09.4 implementation evidence
- New page-level flow coverage:
  - `test/e2e/multi-chat-flow.spec.ts` (new)
    - loading state
    - empty state
    - successful send/stream render
    - stream error render
    - refresh continuity
    - provider/model change behavior
- UI support updates:
  - `app/multi-chat/page.tsx`
    - action labels added to improve deterministic browser test targeting
- Verification commands:
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/multi-chat-flow.spec.ts --project=chromium`
  - `npm run type-check`

## 10.1 implementation evidence
- Sidecar status: optional (no change from locked topology).
- Decision anchors:
  - `handoff_work/llminstructions.md` (`03.1`)
  - `PYTHON_INTEGRATION.md`
  - `handoff_work/CLOSURE_MASTER_CHECKLIST.md`

## 10.2 implementation evidence
- Added orchestrate route tests:
  - `test/api-llm-orchestrate-route.test.ts` (new)
    - sidecar success passthrough
    - fallback on 5xx/network/timeout
    - non-fallback 429 behavior
    - auth + validation checks
- Verification commands:
  - `npm run test:run -- test/api-llm-orchestrate-route.test.ts`
  - `npm run type-check`
- Stability note:
  - cleared stale generated `.next/dev/types` cache when malformed artifacts broke type-check, then revalidated.

## 11.1 implementation evidence
- Existing API tests verified:
  - `test/api-goals-routes.test.ts`
- Added UI flow coverage:
  - `test/e2e/goal-hub-flow.spec.ts` (new)
    - loading/empty/create/update/refresh/delete coverage
- Verification commands:
  - `npm run test:run -- test/api-goals-routes.test.ts`
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/goal-hub-flow.spec.ts --project=chromium`
  - `npm run type-check`

## 11.2 implementation evidence
- Existing API tests verified:
  - `test/api-personas-routes.test.ts`
- Added UI flow coverage:
  - `test/e2e/personas-flow.spec.ts` (new)
    - loading/empty/create/edit/list/delete coverage
- UI support update:
  - `app/personas/page.tsx` adds accessible labels for edit/delete icon actions
- Verification commands:
  - `npm run test:run -- test/api-personas-routes.test.ts`
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/personas-flow.spec.ts --project=chromium`
  - `npm run type-check`

## 11.3 implementation evidence
- API route truthfulness coverage strengthened:
  - `test/api-analytics-route.test.ts`
    - explicit empty telemetry assertions
    - hard 500 behavior on analytics-service failure
- New UI flow coverage:
  - `test/e2e/analytics-flow.spec.ts` (new)
    - loading/empty/refresh/live/timeframe-switch/error+retry coverage
- UI support hardening:
  - `app/analytics/page.tsx`
    - fixed empty-state detection to avoid false non-empty dashboards from zero-filled trends
    - added top refresh action label for deterministic accessibility automation
- Verification commands:
  - `npm run test:run -- test/api-analytics-route.test.ts`
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/analytics-flow.spec.ts --project=chromium`
  - `npm run type-check`

## 11.4 implementation evidence
- New UI flow coverage:
  - `test/e2e/comparison-flow.spec.ts` (new)
    - model-metrics tab verified with live analytics payload
    - conversation-response tab verified with conversation/detail API payloads
    - analytics load failure + retry recovery verified
- Verification commands:
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/comparison-flow.spec.ts --project=chromium`
  - `npm run type-check`

## 11.5 implementation evidence
- New UI flow coverage:
  - `test/e2e/pipeline-flow.spec.ts` (new)
    - configured provider loading
    - orchestration run + result cards + fallback badge
    - local prompt/provider validation
    - orchestration failure handling
    - clear-results state reset
- Verification commands:
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/pipeline-flow.spec.ts --project=chromium`
  - `npm run type-check`

## 11.6 implementation evidence
- Decision:
  - closed via explicit demotion path (allowed by checklist) instead of supported-flow acceptance.
- Evidence anchors:
  - `handoff_work/llminstructions.md` marks `/ai-roundtable` experimental under locked scope (`02.3`).
  - `handoff_work/CLOSURE_MASTER_CHECKLIST.md` `11.6` pass gate allows explicit demotion/remove from supported scope.
- Outcome:
  - roundtable remains experimental/beta and is excluded from supported production release gates.

## 11.7 implementation evidence
- Route/service evidence:
  - `test/api-config-route.test.ts`
  - `test/api-provider-configs-route.test.ts`
  - `test/api-test-api-key-route.test.ts`
- UI evidence:
  - `test/e2e/provider-configuration.spec.ts` rewritten to current endpoint contract
    - save/verify/clear provider key lifecycle from `/settings`
    - invalid key rejection without persistence
- UI fix:
  - `app/settings/page.tsx`
    - switched tabs root to `defaultValue="general"` to restore reliable provider-tab activation
- Verification commands:
  - `npm run test:run -- test/api-config-route.test.ts test/api-provider-configs-route.test.ts test/api-test-api-key-route.test.ts`
  - `AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npx playwright test test/e2e/provider-configuration.spec.ts --project=chromium`
  - `npm run type-check`

## 12.1 implementation evidence
- Scope handling:
  - kept admin surface in experimental/demoted scope per locked `02.3` contract.
- Route evidence:
  - `test/api-admin-status-route.test.ts`
  - `test/api-admin-errors-stats-route.test.ts`
- Verification command:
  - `npm run test:run -- test/api-admin-status-route.test.ts test/api-admin-errors-stats-route.test.ts`
- Outcome:
  - admin routes remain non-blocking for supported production acceptance; route auth/truth behavior is still executable and covered.

## 12.2 implementation evidence
- Decision:
  - closed by explicit removal path from supported production scope (not by support/acceptance path).
- Evidence anchors:
  - `handoff_work/llminstructions.md` `02.3` classification already marks `/api/teams` as remove-from-scope.
  - route/service reality confirmed at `app/api/teams/route.ts` + `services/team-service.db.ts` with no supported UI surface tie-in.
- Outcome:
  - teams route remains out-of-contract and non-blocking for supported release acceptance.

## 12.3 implementation evidence
- Optional-scope handling:
  - billing remains optional per locked topology (`03.1`), so closure uses optional-feature gate.
- Route evidence:
  - `test/api-subscriptions-routes.test.ts`
  - `test/api-stripe-webhook-route.test.ts`
- Verification commands:
  - `npm run test:run -- test/api-subscriptions-routes.test.ts test/api-stripe-webhook-route.test.ts`
  - `npm run type-check`
- Outcome:
  - billing/subscription/webhook routes are executable when configured and fail safely/explicitly when Stripe config is absent.

## 12.4 implementation evidence
- Route evidence:
  - `test/api-stripe-webhook-route.test.ts`
- Verification tooling evidence:
  - `scripts/verify-production.sh` webhook validation path (`--check-webhook`) confirmed as the live-gate mechanism when Stripe is enabled and a deploy URL is available.
- Outcome:
  - closed via optional-feature contract with clear billing-owner dependency for live signed-webhook validation in Stripe-enabled environments.

## Phase D - core runtime hardening
12. [x] Verify auth split:
   - guest mode
   - strict mode
   - misconfigured strict mode
13. [x] Verify DB-first persistence and remove unsupported production fallback ambiguity
14. [x] Verify migration path in production-like mode
15. [x] Verify provider config lifecycle and API key encryption flow
16. [x] Verify `/api/llm/chat`
17. [x] Verify `/api/llm/stream`
18. [x] Verify conversations end-to-end

## Phase E - feature acceptance
19. [x] Goals
20. [x] Personas
21. [x] Analytics
22. [x] Comparison
23. [x] Pipeline
24. [x] AI roundtable (demoted)
25. [x] Admin routes (demoted)
26. [x] Teams route (removed)
27. [x] Billing + webhook (optional gate)

## Phase F - proof
28. [ ] Fill coverage gaps in route/service/e2e tests
29. [ ] Upgrade smoke script to cover actual supported flows
30. [ ] Upgrade production verification script
31. [ ] Align CI with real release gates
32. [ ] Run clean local install -> type-check -> lint -> tests -> build
33. [ ] Run preview deploy verification
34. [ ] Run production deploy verification
35. [ ] Run rollback proof

## Phase G - handoff
36. [ ] Re-run doc/code mismatch check
37. [ ] Build final handoff bundle
38. [ ] Mark handoff-ready only when all checklist pass gates are green

## Mandatory reporting format for every next update
- done
- failed
- unverified
- blockers
- exact files changed
- exact commands run
- exact evidence produced
