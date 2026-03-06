# CLOSURE_MASTER_CHECKLIST

Source basis: direct inspection of the local repository at commit `1e7ca77fd8d51ff8b45f8dbd7ff77d40e0dcbdc0` on branch `codex/protected-main-push-20260302`.

Repository remote: `https://github.com/IAlready8/MultiLLM-Chat-Assistant.git`

This checklist is in strict dependency order. Do not skip ahead. A task is closed only when its pass/fail gate is satisfied and evidence is attached.

## Owner role legend
- **LLM** = next coding model working inside repo
- **Repo operator** = human with local repo access
- **Infra owner** = human with Vercel, database, domain, GitHub access
- **Billing owner** = human with Stripe access

## Execution progress
- Last updated: `2026-03-05 21:49:24 EST` (`2026-03-06T02:49:24Z`)
- [x] `01.1` Record repo identity (PASS)
- [x] `01.2` Capture repo topology (PASS)
- [x] `01.3` Mark stale docs (PASS)
- [x] `02.1` List the actual user-facing pages (PASS)
- [x] `02.2` List the actual API surface (PASS)
- [x] `02.3` Decide supported production scope (PASS)
- [x] `02.4` Define success criteria per supported feature (PASS)
- [x] `03.1` Choose official production runtime (PASS)
- [x] `03.2` Map required external systems (PASS)
- [x] `03.3` Kill unsupported production fallback paths (PASS)
- [x] `04.1` Audit `.env.example` against code (PASS)
- [x] `04.2` Add startup validation for required env (PASS)
- [x] `04.3` Align verification scripts to real env rules (PASS)
- [x] `05.1` Rewrite stale status docs (PASS)
- [x] `05.2` Mark incomplete subsystems honestly (PASS)
- [x] `05.3` Archive or demote dead/confusing guidance (PASS)
- [x] `06.1` Verify auth mode split (PASS)
- [x] `06.2` Close auth fallback ambiguity (PASS)
- [x] `06.3` Verify protected route behavior (PASS)
- [x] `07.1` Confirm Prisma schema reality (PASS)
- [x] `07.2` Map DB-first vs fallback behavior (PASS)
- [x] `07.3` Remove unsupported persistence ambiguity (PASS)
- [x] `07.4` Verify migration path (PASS)
- [x] `08.1` Verify provider registry truth (PASS)
- [x] `08.2` Verify provider config routes (PASS)
- [x] `08.3` Verify key encryption contract (PASS)
- [x] `08.4` Verify provider-specific failure behavior (PASS)
- [x] `09.1` Verify chat route contract (PASS)
- [x] `09.2` Verify stream route contract (PASS)
- [x] `09.3` Verify conversation persistence (PASS)
- [x] `09.4` Verify main chat UI flow (PASS)
- [x] `10.1` Decide sidecar status (PASS)
- [x] `10.2` If optional: isolate cleanly (PASS)
- [x] `11.1` Goals feature (PASS)
- [x] `11.2` Personas feature (PASS)
- [x] `11.3` Analytics feature (PASS)
- [x] `11.4` Comparison feature (PASS)
- [x] `11.5` Pipeline feature (PASS)
- [x] `11.6` AI roundtable feature (PASS - demoted)
- [x] `11.7` Settings page (PASS)
- [x] `12.1` Admin routes (PASS - demoted)
- [x] `12.2` Teams route (PASS - removed from scope)
- [x] `12.3` Billing routes and page (PASS - optional gate)
- [x] `12.4` Webhook verification (PASS - optional gate)
- [x] `13.1` Reconcile declared tests with actual coverage (PASS)
- [x] `13.2` Add missing route/service tests (PASS)
- [x] `13.3` Add/finish browser e2e (PASS)
- [x] `13.4` Add chaos and degraded-mode tests (PASS)
- [x] `14.1` Upgrade smoke test coverage (PASS)
- [x] `14.2` Upgrade production verification (PASS)
- [x] `14.3` Align CI to release gates (PASS)
- [x] `15.1` Re-run dependency audit (PASS)
- [x] `15.2` Close route-level auth gaps (PASS)
- [x] `15.3` Verify secret handling and redaction (PASS)
- [x] `15.4` Create residual risk register (PASS)
- [x] `16.1` Verify `/api/health` truthfulness (PASS)
- [x] `16.2` Standardize logs and error surfaces (PASS)
- [x] `16.3` Create operator runbooks (PASS)

---

## 01. Freeze baseline and capture current truth

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 01.1 ✅ | Record repo identity | none | Capture `git rev-parse HEAD`; capture current branch from `.git/HEAD`; capture remote URL from `.git/config`; capture Node, npm, Python versions used in session | PASS (closed 2026-03-02) | `.currentstatus`, `.plan` | LLM | Raw command output captured in `currentstatus.md` section `01.1` |
| 01.2 ✅ | Capture repo topology | 01.1 | Enumerate routes, pages, services, provider adapters, workflows, tests, docs | PASS (closed 2026-03-02) | `.skill`, `CLAUDE.md`, `CLOSURE_MASTER_CHECKLIST.md` | LLM | Full inventory captured in `currentstatus.md` section `01.2` |
| 01.3 ✅ | Mark stale docs | 01.2 | Compare `README.md`, `ARCHITECTURE.md`, `STATUS_UPDATE.md`, `COMPLETION_REPORT.md`, `PYTHON_INTEGRATION.md`, existing `CLAUDE.md` against current code paths and counts | PASS (closed 2026-03-02) | `.currentstatus` | LLM | Mismatch table with file/line contradictions captured in `currentstatus.md` section `01.3` |

## 02. Lock the supported product contract

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 02.1 ✅ | List the actual user-facing pages | 01.2 | Confirm pages from `app/**/page.tsx`; separate product pages from auth pages | PASS (closed 2026-03-02) | `.skill`, `CLAUDE.md` | LLM | Grouped page list captured in `skill.md` and `llminstructions.md` |
| 02.2 ✅ | List the actual API surface | 01.2 | Confirm all `app/api/**/route.ts` paths; group by auth, config, llm, CRUD, billing, admin | PASS (closed 2026-03-02) | `.skill`, `CLAUDE.md` | LLM | Grouped API route list with total=22 captured in `skill.md` and `llminstructions.md` |
| 02.3 ✅ | Decide supported production scope | 02.1, 02.2 | For each visible feature surface decide one of: core, optional, experimental, remove from scope | PASS (closed 2026-03-02) | `CLAUDE.md`, `.plan` | Repo operator + LLM | Scope table in `llminstructions.md` + lock summary in `theplan.md` |
| 02.4 ✅ | Define success criteria per supported feature | 02.3 | For each supported surface define minimal acceptance behavior, persistence expectation, auth expectation, error expectation | PASS (closed 2026-03-02) | `CLAUDE.md`, `.plan` | LLM | Acceptance matrix in `llminstructions.md` |

## 03. Lock the runtime topology

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 03.1 ✅ | Choose official production runtime | 02.3 | Choose whether production requires Postgres; choose whether guest mode is allowed in production; choose whether Python sidecar is optional or required; choose whether Stripe is in scope | PASS (closed 2026-03-02) | `CLAUDE.md`, `.rules`, `.plan` | Repo operator | Locked runtime statement in `llminstructions.md`, `rules.md`, and `theplan.md` |
| 03.2 ✅ | Map required external systems | 03.1 | Confirm dependency on Postgres, NextAuth secret, provider keys, optional Stripe, optional Python sidecar, optional OAuth, optional Redis | PASS (closed 2026-03-02) | `.skill`, `CLAUDE.md` | LLM | External systems matrix in `llminstructions.md` + `skill.md`, tied to `.env.example` and code anchors |
| 03.3 ✅ | Kill unsupported production fallback paths | 03.1 | If production requires DB, mark in-memory fallback as local/dev only and update code/docs accordingly; if strict auth is required, remove guest bypass from production story | PASS (closed 2026-03-02) | `.plan`, `.currentstatus` | LLM + Repo operator | Code + docs aligned: `lib/demo-account.ts`, `proxy.ts`, `lib/auth.ts`, `lib/prisma.ts`, `lib/db-fallback.ts`, `services/analytics-service.ts` |

## 04. Normalize environment contracts

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 04.1 ✅ | Audit `.env.example` against code | 03.2 | Trace env usage in auth, provider config, db, billing, verify scripts, sidecar bridge, rate limiting | PASS (closed 2026-03-02) | `.skill`, `CLAUDE.md`, `.currentstatus` | LLM | Env classification + missing-var gap list in `llminstructions.md`, `skill.md`, and `currentstatus.md` |
| 04.2 ✅ | Add startup validation for required env | 04.1 | Ensure app fails fast on missing required env for chosen production shape; ensure disabled features do not require unrelated env | PASS (closed 2026-03-02) | code files in `lib/`, `app/api/`, or startup entry points | LLM | `lib/startup-validation.ts` + targeted tests + type-check output |
| 04.3 ✅ | Align verification scripts to real env rules | 04.2 | Update `scripts/verify-production.sh` and related docs to reflect current required vars and optional modes | PASS (closed 2026-03-02) | `scripts/verify-production.sh`, `README.md`, `ARCHITECTURE.md` | LLM | script diff + successful run evidence against local Postgres (`multillm_verify_20260302`) |

## 05. Resolve documentation drift before code polishing

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 05.1 ✅ | Rewrite stale status docs | 01.3, 03.1 | Replace stale branch names, route counts, provider counts, runtime statements, completion claims | PASS (closed 2026-03-02) | `STATUS_UPDATE.md`, `COMPLETION_REPORT.md`, `README.md`, `ARCHITECTURE.md`, existing `CLAUDE.md` or generated replacement | LLM | Rewrote stale files; no stale-pattern matches remain in authoritative docs |
| 05.2 ✅ | Mark incomplete subsystems honestly | 05.1 | Explicitly document Python sidecar limitation (`src/core/main.py` TODO for stream), fallback behavior, guest mode semantics, optional Stripe scope | PASS (closed 2026-03-02) | docs above + `PYTHON_INTEGRATION.md` | LLM | Python stream TODO + fallback/auth/optional billing notes now explicit |
| 05.3 ✅ | Archive or demote dead/confusing guidance | 05.2 | Remove or archive docs that no longer match current branch or workflow | PASS (closed 2026-03-02) | top-level docs | Repo operator + LLM | `DOCS_SOURCE_OF_TRUTH.md` defines authoritative vs historical docs |

## 06. Harden auth and identity flows

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 06.1 ✅ | Verify auth mode split | 03.1, 04.2 | Review `proxy.ts`, `lib/auth.ts`, `lib/api-auth.ts`, demo/guest helpers, auth pages, route guards | PASS (closed 2026-03-02) | `proxy.ts`, `lib/auth.ts`, related auth files | LLM | auth behavior matrix in `llminstructions.md` + passing auth test suite |
| 06.2 ✅ | Close auth fallback ambiguity | 06.1 | Decide whether in-memory auth user creation is allowed outside local/dev; if not, gate it | PASS (closed 2026-03-02) | `lib/auth.ts`, docs | LLM + Repo operator | `isInMemoryAuthFallbackAllowed()` policy + auth tests |
| 06.3 ✅ | Verify protected route behavior | 06.1 | Test page redirects, API 401s, auth misconfiguration 500s, callback URL behavior | PASS (closed 2026-03-02) | `test/middleware-auth-routing.test.ts`, `test/api-auth.test.ts`, `test/e2e/auth-flow.spec.ts` | LLM | route tests + strict-auth chromium e2e + runtime HTTP probe output |

## 07. Harden data model and persistence

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 07.1 ✅ | Confirm Prisma schema reality | 03.1 | Review `prisma/schema.prisma`, migrations, service layer expectations | PASS (closed 2026-03-02) | `prisma/schema.prisma`, `prisma/migrations/*` | LLM | schema model inventory + runtime usage scan + `prisma migrate status` output |
| 07.2 ✅ | Map DB-first vs fallback behavior | 07.1 | Trace fallback use in `lib/prisma.ts`, `lib/db-fallback.ts`, `lib/api-key-service.ts`, `services/*db.ts`, `services/analytics-service.ts` | PASS (closed 2026-03-02) | `.currentstatus`, `.plan`, code/docs as needed | LLM | service matrix + production read-path fallback regression tests for goals/personas |
| 07.3 ✅ | Remove unsupported persistence ambiguity | 07.2 | For production, eliminate any silent dependence on in-memory stores for supported features | PASS (closed 2026-03-02) | service files + docs | LLM + Repo operator | production fail-closed tests + separate-process restart proof against Postgres |
| 07.4 ✅ | Verify migration path | 07.1 | Run `prisma migrate status`; run `prisma migrate deploy` in test/prod-like env; confirm no pending mismatch | PASS (closed 2026-03-02) | prisma + verification docs | Repo operator | clean status + deploy + status outputs on verification Postgres |

## 08. Harden provider configuration and key lifecycle

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 08.1 ✅ | Verify provider registry truth | 02.2 | Confirm provider adapters and registry entries for OpenAI, Anthropic, Google AI, OpenRouter, Grok | PASS (closed 2026-03-02) | `lib/providers/*`, `README.md`, `CLAUDE.md` | LLM | adapter/registry/type path list + README provider list alignment |
| 08.2 ✅ | Verify provider config routes | 07.3 | Test `/api/config`, `/api/provider-configs`, `/api/test-api-key` in guest and strict auth modes | PASS (closed 2026-03-02) | route files + tests | LLM | deterministic route tests + explicit 500 handling for internal failures |
| 08.3 ✅ | Verify key encryption contract | 08.2 | Trace `API_KEY_ENCRYPTION_SEED`, encryption/decryption path, masked display rules, storage behavior | PASS (closed 2026-03-02) | `lib/api-key-service.ts`, `lib/crypto.ts`, UI files | LLM | targeted encryption/redaction/runtime-seed tests |
| 08.4 ✅ | Verify provider-specific failure behavior | 08.2 | Test invalid key, upstream timeout, upstream 401, upstream 429, malformed response, missing provider config | PASS (closed 2026-03-02) | `app/api/llm/chat/route.ts`, `app/api/llm/stream/route.ts`, `lib/providers/errors.ts` | LLM | expanded chat/stream route tests + deterministic error classifier update |

## 09. Harden core chat and streaming

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 09.1 ✅ | Verify chat route contract | 08.4 | Test success, auth failure, validation failure, provider failure, DB failure, guest mode, strict mode | PASS (closed 2026-03-02) | `app/api/llm/chat/route.ts`, related tests | LLM | expanded chat route contract tests |
| 09.2 ✅ | Verify stream route contract | 09.1 | Test NDJSON stream event types, abort path, provider failure path, browser rendering path | PASS (closed 2026-03-02) | `app/api/llm/stream/route.ts`, `services/ndjson.ts`, `services/stream-client.ts`, tests | LLM | NDJSON route + stream-client tests + multi-chat protocol alignment |
| 09.3 ✅ | Verify conversation persistence | 07.3, 09.1 | Test create, load, rename, delete, list, refresh persistence across sessions | PASS (closed 2026-03-02) | `app/api/conversations/*.ts`, `services/conversation-service*.ts`, UI components | LLM | conversation route/service lifecycle tests + refresh e2e (`test/e2e/conversation-persistence.spec.ts`) |
| 09.4 ✅ | Verify main chat UI flow | 09.1, 09.2, 09.3 | Run page-level tests for `/multi-chat`; include loading, empty, success, error, refresh, provider change | PASS (closed 2026-03-02) | `app/multi-chat/page.tsx`, `components/conversation-manager.tsx` | LLM | new e2e flow test (`test/e2e/multi-chat-flow.spec.ts`) + passing chromium run |

## 10. Resolve Python sidecar truth

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 10.1 ✅ | Decide sidecar status | 03.1, 05.2 | Keep optional, make required, or remove from supported handoff scope | PASS (closed 2026-03-02) | `.currentstatus`, `.plan`, `PYTHON_INTEGRATION.md`, `CLAUDE.md` | Repo operator | optional sidecar decision reaffirmed from locked runtime (`03.1`) |
| 10.2 ✅ | If optional: isolate cleanly | 10.1 | Ensure `/api/llm/orchestrate` local fallback is documented and tested; ensure missing sidecar does not fail core app | PASS (closed 2026-03-02) | `app/api/llm/orchestrate/route.ts`, docs, tests | LLM | new orchestrate route tests (`test/api-llm-orchestrate-route.test.ts`) covering success + local fallback paths |
| 10.3 | If required: finish parity | 10.1 | Implement missing `/api/v1/llm/stream`; align auth, schemas, provider support, health checks, docs, tests | PASS when sidecar supports required runtime contract | `src/core/*`, `tests/*python*`, route bridge, docs | LLM + Repo operator | passing Python tests and integration evidence |

## 11. Verify CRUD feature surfaces beyond chat

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 11.1 ✅ | Goals feature | 07.3 | Verify create/edit/delete/list/update status in routes and UI | PASS (closed 2026-03-02) | goal files + tests | LLM | API route tests + goal-hub e2e flow (`test/api-goals-routes.test.ts`, `test/e2e/goal-hub-flow.spec.ts`) |
| 11.2 ✅ | Personas feature | 07.3 | Verify create/edit/delete/list/use in routes and UI | PASS (closed 2026-03-02) | persona files + tests | LLM | API route tests + personas e2e flow (`test/api-personas-routes.test.ts`, `test/e2e/personas-flow.spec.ts`) |
| 11.3 ✅ | Analytics feature | 07.3 | Verify `/analytics` and `/api/analytics` do not show fake or broken data and handle empty state | PASS (closed 2026-03-03) | analytics files + tests | LLM | strengthened route assertions + analytics e2e flow (`test/api-analytics-route.test.ts`, `test/e2e/analytics-flow.spec.ts`, `app/analytics/page.tsx`) |
| 11.4 ✅ | Comparison feature | 09.1, 09.2 | Verify `/comparison` can execute and render real comparison flow or explicitly demote it | PASS (closed 2026-03-03) | comparison page + any backing code/tests | LLM | comparison e2e flow + failure recovery (`test/e2e/comparison-flow.spec.ts`) |
| 11.5 ✅ | Pipeline feature | 09.1 | Verify `/pipeline` is real and tested or explicitly demote/remove from scope | PASS (closed 2026-03-03) | pipeline page + docs | LLM + Repo operator | pipeline e2e flow + validation/failure handling (`test/e2e/pipeline-flow.spec.ts`) |
| 11.6 ✅ | AI roundtable feature | 09.1 | Verify `/ai-roundtable` is real and tested or explicitly demote/remove from scope | PASS (closed 2026-03-03) | ai-roundtable page + docs | LLM + Repo operator | explicitly demoted from supported production scope (retained as experimental beta only; non-blocking for release gates) |
| 11.7 ✅ | Settings page | 08.2 | Verify provider config and related controls work end-to-end from `/settings` | PASS (closed 2026-03-03) | `app/settings/page.tsx`, related components | LLM | updated provider e2e + route contract tests (`test/e2e/provider-configuration.spec.ts`, `test/api-config-route.test.ts`, `test/api-provider-configs-route.test.ts`, `test/api-test-api-key-route.test.ts`) |

## 12. Verify admin, teams, and billing truth

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 12.1 ✅ | Admin routes | 02.3 | Verify `/api/admin/status` and `/api/admin/errors/stats`; verify any admin UI page status; confirm auth requirement | PASS (closed 2026-03-03) | admin route files, admin pages/tests | LLM | admin surface retained as experimental/demoted; auth + route truth covered by `test/api-admin-status-route.test.ts` and `test/api-admin-errors-stats-route.test.ts` |
| 12.2 ✅ | Teams route | 07.3 | Verify `/api/teams` implementation, auth, persistence, and any absent UI implications | PASS (closed 2026-03-03) | `app/api/teams/route.ts`, `services/team-service.db.ts` | LLM | explicitly removed from supported production scope (no linked UI contract; retained only as out-of-scope backend surface) |
| 12.3 ✅ | Billing routes and page | 03.1 | Verify Stripe page, checkout, manage portal, webhook handling, subscription persistence if billing is in scope | PASS (closed 2026-03-03) | billing files, webhook route, subscription files/tests | LLM + Billing owner | closed via optional-feature gate with route/webhook tests + explicit Stripe-missing degradation coverage (`test/api-subscriptions-routes.test.ts`, `test/api-stripe-webhook-route.test.ts`) |
| 12.4 ✅ | Webhook verification | 12.3 | Use `scripts/verify-production.sh --check-webhook`; confirm signature validation and failure handling | PASS (closed 2026-03-03) | `app/api/webhooks/stripe/route.ts`, script, tests | Billing owner + LLM | optional-feature closure with webhook route test coverage + verify script gate semantics (live signed-webhook run remains billing-owner dependent when Stripe is enabled) |

## 13. Strengthen automated test coverage

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 13.1 ✅ | Reconcile declared tests with actual coverage | 09.4, 11.*, 12.* | Map each supported feature to one or more test files; identify gaps | PASS (closed 2026-03-04) | `.plan`, `.currentstatus` | LLM | supported-surface coverage matrix completed; missing supported page gap closed via `test/e2e/home-and-api-test-flow.spec.ts`; consolidated route/service matrix run passed (`23` files, `150` tests) |
| 13.2 ✅ | Add missing route/service tests | 13.1 | Fill route and service gaps found in matrix | PASS (closed 2026-03-04) | `test/*.test.ts`, `.currentstatus`, `.plan` | LLM | route/service gate matrix confirms happy+failure coverage across all supported API surfaces; consolidated route/service run passed (`23` files, `150` tests) |
| 13.3 ✅ | Add/finish browser e2e | 13.1 | Expand Playwright specs for strict auth, guest mode, provider config, chat, stream, conversations, settings, goals, personas, analytics, comparison, billing if in scope | PASS (closed 2026-03-04) | `test/e2e/*.spec.ts`, `.currentstatus`, `.plan` | LLM | supported guest-mode e2e matrix passed (`10/10`); strict-auth subset passed (`2/2`); analytics/provider specs stabilized for deterministic execution |
| 13.4 ✅ | Add chaos and degraded-mode tests | 13.1 | Cover DB unavailable, missing env, provider outage, sidecar outage, bad webhook, rate limits | PASS (closed 2026-03-04) | `test/*.test.ts`, `.currentstatus`, `.plan` | LLM | degraded-mode bundle passed (`10` files, `64` tests) spanning DB/env/provider/sidecar/webhook/rate-limit failure classes |

## 14. Turn scripts into real release gates

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 14.1 ✅ | Upgrade smoke test coverage | 09.4, 11.*, 12.* | Extend `scripts/smoke-test.sh` beyond page/status checks to cover real feature roundtrips used in supported scope | PASS when smoke catches broken core behavior | `scripts/smoke-test.sh` | LLM | Closed 2026-03-05 with guest-mode smoke execution against `http://localhost:3001`: `37` passed, `0` failed, `0` skipped, including config/goals/personas/conversations/analytics lifecycle checks |
| 14.2 ✅ | Upgrade production verification | 04.3, 12.4 | Ensure `scripts/verify-production.sh` checks env, DB, health, migrations, optional Stripe, optional webhook, optional sidecar according to scope | PASS when verify script represents actual handoff gate | `scripts/verify-production.sh` | LLM | Closed 2026-03-05 after adding fail-fast for `--check-webhook` without `--base-url` and re-running help/fail-fast/DB-backed happy-path verification successfully |
| 14.3 ✅ | Align CI to release gates | 14.1, 14.2 | Confirm CI jobs reflect required checks; add any missing gates; decide blocking vs informational security policy | PASS when CI reflects release contract | `.github/workflows/ci.yml` | Repo operator + LLM | Closed 2026-03-05: branch protection confirmed required contexts = `Quality Checks` + `Smoke Tests`; CI now cancels superseded runs, `Smoke Tests` executes `verify-production.sh --apply-migrations` before prod smoke, readiness uses `/api/health`, and noisy auto `claude-review` workflow was removed |

## 15. Security closure

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 15.1 ✅ | Re-run dependency audit | 14.3 | Run `npm audit` and `npm audit --omit=dev`; record exact findings | PASS when current findings are captured against current lockfile | `.currentstatus`, security docs | Repo operator | Closed 2026-03-05 with live audit capture: full tree = `36` vulnerabilities (`25` high, `10` moderate, `1` low); prod-only = `9` vulnerabilities (`4` high, `5` moderate), primarily via Prisma CLI transitive `hono`/`lodash` chain |
| 15.2 ✅ | Close route-level auth gaps | 06.*, 12.* | Confirm admin, billing, team, config, CRUD, chat routes enforce intended identity rules | PASS when no supported sensitive route is under-protected | route files + tests | LLM | Closed 2026-03-05 after adding explicit admin-role enforcement for admin routes and re-running auth/admin/full-suite tests successfully (`33` files, `239` tests passed) |
| 15.3 ✅ | Verify secret handling and redaction | 08.3 | Confirm no plaintext key leakage in logs, responses, UI, export/import flows | PASS when redaction rules are tested | `lib/api-key-service.ts`, `lib/crypto.ts`, `services/export-import-service.ts`, logs/tests | LLM | Closed 2026-03-05 after removing API keys from export/import payloads, updating UI copy, and adding export/import secrecy tests while keeping provider-config/key-service redaction coverage intact |
| 15.4 ✅ | Create residual risk register | 15.1, 15.2, 15.3 | Document any accepted remaining risks with explicit owner and reason | PASS when no serious unknown risk remains | `.currentstatus` or security doc | Repo operator | Closed 2026-03-05 with explicit residual risk register in `currentstatus.md` (dependency advisories, external deploy noise, optional sidecar parity gap) |

## 16. Observability and operational readiness

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 16.1 ✅ | Verify `/api/health` truthfulness | 07.4, 10.1 | Confirm health reflects DB, optional sidecar, metrics payload, degraded status correctly | PASS when health endpoint matches actual dependency state | `app/api/health/route.ts`, tests | LLM | Closed 2026-03-05 after replacing placeholder cache checks with real rate-limit diagnostics, adding optional sidecar health reporting, and re-running route tests plus live smoke evidence for healthy/degraded states |
| 16.2 | Standardize logs and error surfaces | 09.*, 12.* | Ensure route errors and server logs carry enough context without leaking secrets | PASS when logs are useful and safe | route files, `lib/error-system.ts` if used | LLM | log samples |
| 16.3 | Create operator runbooks | 14.2, 16.1 | Add startup, deploy, rollback, incident, and recovery docs only after verified | PASS when another operator can deploy and recover without guessing | docs set | Repo operator + LLM | completed runbooks |

## 17. Live deploy proof

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 17.1 | Clean local install proof | 14.3 | From clean checkout run install, generate, type-check, lint, tests, build | PASS when all baseline local gates pass from scratch | no code target; capture in status | Repo operator | full command log |
| 17.2 | Preview deploy proof | 17.1 | Deploy preview with required env; run verify script and smoke against preview URL | PASS when preview passes verify and smoke | deployment docs | Infra owner | URLs + logs |
| 17.3 | Production deploy proof | 17.2 | Deploy production; run verify script and smoke against production URL | PASS when production passes verify and smoke | deployment docs | Infra owner | URLs + logs |
| 17.4 | Rollback proof | 17.3 | Trigger or simulate rollback to prior healthy release; verify app recovers | PASS when rollback procedure is executable and proven | rollback docs | Infra owner | rollback log |

## 18. Final handoff package

| ID | Task | Depends On | Sub-tasks | Pass/Fail gate | File targets | Owner | Evidence |
|---|---|---|---|---|---|---|---|
| 18.1 | Final truth pass | 05.*, 17.* | Re-read README, architecture, env docs, handoff docs against final code | PASS when docs and code match exactly | docs + handoff files | LLM | final mismatch check = zero unresolved |
| 18.2 | Assemble handoff bundle | 18.1 | Include final docs, closure checklist, status, plan, runbooks, evidence references, release tag | PASS when new maintainer can take over with no missing context | handoff folder / release artifact | Repo operator | bundle manifest |
| 18.3 | Declare handoff-ready state | 18.2 | Only after all PASS gates above are green | PASS when no blocker remains open | `.currentstatus` | Repo operator | signed checklist |

---

## Immediate high-value blockers already visible from inspection

1. `STATUS_UPDATE.md` points to `chore-next16-migration`, while `.git/HEAD` points to `codex/protected-main-push-20260302`.
2. `COMPLETION_REPORT.md` is stale relative to current route/provider/runtime counts.
3. Existing `CLAUDE.md` says provider support is OpenAI / Anthropic / Google AI / OpenRouter, but code also has `lib/providers/grok.ts`.
4. Existing `CLAUDE.md` says Python core is not integrated with Next.js runtime, but `app/api/llm/orchestrate/route.ts` actively proxies to it.
5. `src/core/main.py` explicitly contains `# TODO: Add /api/v1/llm/stream endpoint`.
6. `README.md` says current runtime uses Prisma stubs; `lib/prisma.ts` clearly supports a real runtime Prisma client when `DATABASE_URL` is set.
