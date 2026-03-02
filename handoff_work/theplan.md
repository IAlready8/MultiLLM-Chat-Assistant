# .plan

goal: move repository to handoff-ready state with zero undocumented ambiguity

## Operating rule
Do everything in dependency order. Do not skip ahead. Update `.currentstatus` after every major checkpoint.

## Progress snapshot (2026-03-02 03:48 EST)
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
- failed:
  - none
- unverified:
  - runtime/build/test/deploy proof steps not executed yet
- blockers:
  - `04.3` needs a successful verify run against reachable DB/base URL
  - stale docs not rewritten yet (`05.*`)

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
- Full close pending: need one successful end-to-end `verify-production.sh` run against a reachable Postgres instance (and base URL checks if provided).

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
8. [ ] Align `scripts/verify-production.sh` to the chosen topology

## Phase C - code/docs alignment
9. [ ] Rewrite stale docs only after the topology decision is made
10. [ ] Replace stale `CLAUDE.md` with the generated version or merge it carefully
11. [ ] Update README/architecture/status/completion/python docs so code and docs match

## Phase D - core runtime hardening
12. [ ] Verify auth split:
   - guest mode
   - strict mode
   - misconfigured strict mode
13. [ ] Verify DB-first persistence and remove unsupported production fallback ambiguity
14. [ ] Verify provider config lifecycle and API key encryption flow
15. [ ] Verify `/api/llm/chat`
16. [ ] Verify `/api/llm/stream`
17. [ ] Verify conversations end-to-end

## Phase E - feature acceptance
18. [ ] Goals
19. [ ] Personas
20. [ ] Analytics
21. [ ] Comparison
22. [ ] Pipeline
23. [ ] AI roundtable
24. [ ] Admin routes
25. [ ] Teams route
26. [ ] Billing + webhook only if billing remains in production scope

## Phase F - proof
27. [ ] Fill coverage gaps in route/service/e2e tests
28. [ ] Upgrade smoke script to cover actual supported flows
29. [ ] Upgrade production verification script
30. [ ] Align CI with real release gates
31. [ ] Run clean local install -> type-check -> lint -> tests -> build
32. [ ] Run preview deploy verification
33. [ ] Run production deploy verification
34. [ ] Run rollback proof

## Phase G - handoff
35. [ ] Re-run doc/code mismatch check
36. [ ] Build final handoff bundle
37. [ ] Mark handoff-ready only when all checklist pass gates are green

## Mandatory reporting format for every next update
- done
- failed
- unverified
- blockers
- exact files changed
- exact commands run
- exact evidence produced
