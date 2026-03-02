# CLAUDE.md

This file replaces stale repo guidance with code-verified working rules for this repository.

## Repository identity
- Remote: `https://github.com/IAlready8/MultiLLM-Chat-Assistant.git`
- Observed HEAD: `3a5081be3a69f57cbf56c06d179f58d85eec4b03`
- Observed branch: `codex/protected-main-push-20260302`

## What this repository is
A Next.js App Router multi-provider LLM application with:
- chat
- streaming chat
- conversations
- goals
- personas
- analytics
- comparison UI
- pipeline UI
- AI Roundtable UI
- settings/provider key management
- billing page
- admin status/error routes
- optional Python orchestration sidecar

## Code-verified stack
From `package.json`:
- Next.js `^16.1.1`
- React `18`
- TypeScript `^5`
- NextAuth `^4.24.7`
- Prisma `^7.3.0`
- PostgreSQL via `@prisma/adapter-pg`
- Stripe `^20.0.0`
- Vitest
- Playwright

## Code-verified route surface
- Auth (2):
  - `app/api/auth/[...nextauth]/route.ts`
  - `app/api/auth/upgrade-guest/route.ts`
- Config (3):
  - `app/api/config/route.ts`
  - `app/api/provider-configs/route.ts`
  - `app/api/test-api-key/route.ts`
- LLM (3):
  - `app/api/llm/chat/route.ts`
  - `app/api/llm/orchestrate/route.ts`
  - `app/api/llm/stream/route.ts`
- CRUD domain routes (7):
  - `app/api/analytics/route.ts`
  - `app/api/conversations/[id]/route.ts`
  - `app/api/conversations/route.ts`
  - `app/api/goals/[id]/route.ts`
  - `app/api/goals/route.ts`
  - `app/api/personas/[id]/route.ts`
  - `app/api/personas/route.ts`
- Billing (3):
  - `app/api/subscriptions/manage/route.ts`
  - `app/api/subscriptions/route.ts`
  - `app/api/webhooks/stripe/route.ts`
- Admin (2):
  - `app/api/admin/errors/stats/route.ts`
  - `app/api/admin/status/route.ts`
- Ops/health (1):
  - `app/api/health/route.ts`
- Team (1):
  - `app/api/teams/route.ts`

## Code-verified page surface
- Product pages (11):
  - `app/ai-roundtable/page.tsx`
  - `app/analytics/page.tsx`
  - `app/api-test/page.tsx`
  - `app/billing/page.tsx`
  - `app/comparison/page.tsx`
  - `app/goal-hub/page.tsx`
  - `app/multi-chat/page.tsx`
  - `app/page.tsx`
  - `app/personas/page.tsx`
  - `app/pipeline/page.tsx`
  - `app/settings/page.tsx`
- Auth pages (3):
  - `app/auth/error/page.tsx`
  - `app/auth/signin/page.tsx`
  - `app/auth/signout/page.tsx`
- Admin pages (2):
  - `app/admin/errors/page.tsx`
  - `app/admin/status/page.tsx`

## 02.3 production scope decision
Every visible surface is explicitly classified.

- Core:
  - Home shell: `app/page.tsx`
  - Auth UX/routes: `app/auth/error/page.tsx`, `app/auth/signin/page.tsx`, `app/auth/signout/page.tsx`, `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/upgrade-guest/route.ts`
  - Chat/conversations: `app/multi-chat/page.tsx`, `app/api/llm/chat/route.ts`, `app/api/llm/stream/route.ts`, `app/api/conversations/route.ts`, `app/api/conversations/[id]/route.ts`
  - Provider configuration: `app/settings/page.tsx`, `app/api/config/route.ts`, `app/api/provider-configs/route.ts`, `app/api/test-api-key/route.ts`
  - Goals: `app/goal-hub/page.tsx`, `app/api/goals/route.ts`, `app/api/goals/[id]/route.ts`
  - Personas: `app/personas/page.tsx`, `app/api/personas/route.ts`, `app/api/personas/[id]/route.ts`
  - Analytics: `app/analytics/page.tsx`, `app/api/analytics/route.ts`
  - Health endpoint: `app/api/health/route.ts`
- Optional:
  - Billing: `app/billing/page.tsx`, `app/api/subscriptions/route.ts`, `app/api/subscriptions/manage/route.ts`, `app/api/webhooks/stripe/route.ts` (enabled only with Stripe env + webhook config)
  - Python orchestration bridge: `app/api/llm/orchestrate/route.ts` (core app remains valid without sidecar)
  - API test utility page: `app/api-test/page.tsx`
- Experimental:
  - `app/comparison/page.tsx`
  - `app/pipeline/page.tsx`
  - `app/ai-roundtable/page.tsx`
  - `app/admin/status/page.tsx`
  - `app/admin/errors/page.tsx`
  - `app/api/admin/status/route.ts`
  - `app/api/admin/errors/stats/route.ts`
- Remove from production scope:
  - `app/api/teams/route.ts` (no linked UI contract or acceptance tests in current pass)

## 02.4 minimum acceptance matrix (supported = core + optional)

| Surface | Minimal behavior | Persistence expectation | Auth expectation | Error expectation |
|---|---|---|---|---|
| Home shell | Page renders and links to supported surfaces | none | public or session-aware render | non-fatal UI fallback |
| Auth UX/routes | sign-in/sign-out/error routes function; session route works | session store durable in production | strict mode enforces auth; guest only when not strict | invalid credentials/OAuth failure are explicit |
| Chat/conversations | send prompt, receive response/stream, create/list/load/delete conversation | conversation data durable when DB configured for production | same auth rules as runtime mode | provider/validation/auth errors return deterministic JSON + status |
| Provider configuration | add/list/remove/test provider keys/configs from settings | encrypted key storage server-side; no plaintext leakage | authenticated in strict mode | invalid key/config returns actionable error |
| Goals | CRUD works from UI + API | durable in supported production topology | authenticated in strict mode | validation failures return 4xx with message |
| Personas | CRUD/use works from UI + API | durable in supported production topology | authenticated in strict mode | validation failures return 4xx with message |
| Analytics | endpoint/page return real metrics or explicit empty state | derived from actual stored data | authenticated in strict mode | never fabricate success data on backend failure |
| Health endpoint | accurately reports dependency status | none | publicly callable unless policy changes | degraded dependencies reflected in payload/status |
| Billing (optional) | checkout/manage/webhook loop works when enabled | subscription data durable | authenticated for customer actions | webhook/signature failures are explicit and safe |
| Orchestration bridge (optional) | route proxies to sidecar when available, local fallback when unavailable | no separate persistence contract beyond chat path | same auth rules as chat routes | fallback path signals via headers/payload |
| API test page (optional) | manual key/provider test helper works in enabled environments | none | same auth rules as settings | failures surfaced without leaking secrets |

## 03.1 official production runtime (locked)
- Postgres: required in production.
- Strict auth: required in production.
- Stripe: optional (billing feature disabled unless Stripe env + webhook config are present).
- Python sidecar: optional (core app remains supported without sidecar; orchestrate route may fall back locally).
- Redis: optional and out-of-contract for core production acceptance.

Unsupported production shapes:
- no-DB production runtime.
- guest/demo auth as a protected production access path.
- treating optional features (billing, sidecar orchestration) as hard requirements for core availability.

## 03.2 required external systems matrix

| System | Required for locked production? | Env contract | Code anchors | Disabled behavior when absent |
|---|---|---|---|---|
| PostgreSQL | Yes | `DATABASE_URL` | `lib/prisma.ts:22,63-83`; Prisma adapter setup in `lib/auth.ts:239` | Core persistence/auth durability cannot be guaranteed; production contract fails |
| NextAuth secret | Yes | `NEXTAUTH_SECRET` (or `AUTH_SECRET`) | `lib/auth.ts:61-74`; `proxy.ts:48-64` | Strict/prod auth fails closed with configuration error |
| Provider credentials/config | Yes (for real model calls) | stored via settings APIs and encrypted with `API_KEY_ENCRYPTION_SEED` | `app/api/provider-configs/route.ts`, `app/api/test-api-key/route.ts`, `lib/runtime-secrets.ts:16-28` | Provider calls return actionable config/key errors |
| OAuth providers (Google/GitHub) | Optional | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `lib/auth.ts:103-116` | OAuth buttons/providers are omitted; credentials auth path remains |
| Stripe billing | Optional | `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXTAUTH_URL` | `lib/stripe.ts`; `app/api/subscriptions/route.ts`; `app/api/subscriptions/manage/route.ts`; `app/api/webhooks/stripe/route.ts` | Billing routes return explicit 503 config errors |
| Python sidecar | Optional | `PYTHON_CORE_URL` | `app/api/llm/orchestrate/route.ts:8,198,243-277` | Orchestrate route falls back to local orchestration with fallback headers |
| Redis | Optional | `REDIS_URL` | `lib/rate-limit.ts:36-52,139-147`; `lib/cache.ts:106-126` | Cache/rate-limit degrade to in-memory behavior |

## 03.3 fallback enforcement status
- Production DB fallback is disabled via fail-fast boot when `DATABASE_URL` is missing (`lib/prisma.ts`).
- In-memory auth fallback is disabled in strict/production mode (`lib/auth.ts`).
- Strict auth is enforced in production regardless of auth toggle flags (`lib/demo-account.ts`, `proxy.ts`).
- In-memory DB fallback helpers now block fallback creation in production (`lib/db-fallback.ts`), including analytics fallback writes (`services/analytics-service.ts`).

## 04.1 env contract audit

### `.env.example` classification
- Required-all (locked production):
  - `DATABASE_URL`
  - `NEXTAUTH_SECRET` (or `AUTH_SECRET` as alternate)
  - `NEXTAUTH_URL`
  - `API_KEY_ENCRYPTION_SEED`
- Required-conditional:
  - OAuth enabled: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - Non-production demo/guest mode: `DEMO_ACCOUNT_ENABLED`, `DEMO_ACCOUNT_BYPASS_AUTH`, `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`, `DEMO_ACCOUNT_EMAIL`, `DEMO_ACCOUNT_PASSWORD`, `DEMO_ACCOUNT_NAME`, `DEMO_ACCOUNT_ID`, `GUEST_USER_ID`, `GUEST_USER_NAME`, `GUEST_USER_EMAIL`
  - Python sidecar direct provider keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
  - Redis enabled: `REDIS_URL`
- Optional:
  - `AUTH_REQUIRE_LOGIN`, `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- Dead (unused by current runtime code paths):
  - `DB_CONNECTION_LIMIT`, `DB_POOL_TIMEOUT`, `DB_SCHEMA_CACHE_SIZE`
  - `OPENROUTER_API_KEY`
  - `RATE_LIMIT_LLM_PER_USER_PER_MIN`, `RATE_LIMIT_LLM_GLOBAL_PER_MIN`, `RATE_LIMIT_LLM_WINDOW_MS`
  - `ENABLE_PERFORMANCE_MONITORING`, `METRICS_RETENTION_HOURS`, `ALERT_WEBHOOK_URL`
  - `CIRCUIT_BREAKER_FAILURE_THRESHOLD`, `CIRCUIT_BREAKER_TIMEOUT`, `CIRCUIT_BREAKER_RESET_TIMEOUT`
  - `SECURE_STORAGE_SECRET` (legacy script reference, not active runtime path)

### Used in code but missing from `.env.example`
- `AUTH_SECRET` (alternate auth secret)
- `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- `PYTHON_CORE_URL`
- `LLM_FETCH_TIMEOUT_MS`, `LLM_FETCH_RETRIES`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED`, `NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL`, `NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD`, `NEXT_PUBLIC_GUEST_USER_ID`
- `NEXT_PUBLIC_SECURE_STORAGE_KEY`

## 04.2 startup validation implementation
- Added centralized validation module: `lib/startup-validation.ts`.
- Validation now fails fast in production when required core env vars are missing:
  - `DATABASE_URL`
  - `NEXTAUTH_SECRET` (or `AUTH_SECRET`)
  - `NEXTAUTH_URL`
  - `API_KEY_ENCRYPTION_SEED`
- Conditional validation in production:
  - OAuth envs must be complete pairs when either side is set.
  - Stripe envs must include secret + price + webhook together when any Stripe var is set.
- Wired startup checks into:
  - `lib/prisma.ts`
  - `lib/auth.ts`
- Validation proof:
  - `test/startup-validation.test.ts`

## 06.1 auth behavior matrix (verified)

| Mode | Request type | Expected behavior | Code anchors | Test evidence |
|---|---|---|---|---|
| Production (strict always) | Protected API, no token | `401 Unauthorized` (or `500` if auth secret missing) | `proxy.ts`, `lib/demo-account.ts` | `test/middleware-auth-routing.test.ts` |
| Production (strict always) | Protected page, no token | redirect to `/auth/signin` (or `/auth/error` if secret missing) | `proxy.ts` | `test/middleware-auth-routing.test.ts` |
| Production (strict always) | Demo bypass env set | Demo bypass ignored; demo disabled | `lib/demo-account.ts` | `test/demo-account.test.ts` |
| Non-production strict | Protected API/page, no token | same strict behavior as production | `proxy.ts`, `lib/api-auth.ts` | `test/middleware-auth-routing.test.ts`, `test/api-auth.test.ts` |
| Non-production guest/demo | `allowGuest=true`, no session cookie | guest user record returned | `lib/api-auth.ts`, `lib/demo-account.ts` | `test/api-auth.test.ts` |
| Non-production guest/demo | Demo bypass enabled | demo user record returned for bypassed path | `lib/api-auth.ts`, `lib/demo-account.ts` | behavior covered by module logic + demo context tests |

## 06.2 auth fallback policy (closed)
- Policy source of truth:
  - `lib/demo-account.ts` -> `isInMemoryAuthFallbackAllowed()`
- Effective rule:
  - in-memory auth fallback allowed only when:
    - not production, and
    - strict auth is not required
  - otherwise fallback is disabled and primary auth-store failures fail closed
- Enforcement anchor:
  - `lib/auth.ts` uses `isInMemoryAuthFallbackAllowed()` before in-memory auth path.

## 06.3 protected-route verification status
- Route-level checks:
  - `test/middleware-auth-routing.test.ts`
  - `test/api-auth.test.ts`
- E2E strict-auth checks (chromium subset):
  - `test/e2e/auth-flow.spec.ts` (redirect unauthenticated users, preserve callback URL)
  - executed with strict-auth env + CI mode to force fresh web server
- Runtime probe evidence:
  - `/settings` returns `307` to `/auth/signin?callbackUrl=...`
  - `/api/conversations` returns `401` for unauthenticated request in strict mode

## 07.1 Prisma schema reality (verified)
- Models present in `prisma/schema.prisma`:
  - `Account`, `Session`, `User`, `VerificationToken`
  - `Conversation`, `Message`, `ProviderConfig`, `Analytics`, `Goal`, `Persona`
  - `Team`, `TeamMember`, `Subscription`
- Runtime usage scan confirms schema-backed model access across app/service layers:
  - auth/session + users/subscriptions (`lib/auth.ts`, `lib/stripe.ts`)
  - conversations/messages (`services/conversation-service*.ts`)
  - goals/personas/analytics (`services/*`, `lib/error-system.ts`)
  - provider config/key lifecycle (`lib/api-key-service.ts`, `lib/config-manager.ts`)
- Migration status on verification database:
  - `npx prisma migrate status` -> `Database schema is up to date!`

## 07.2 DB-first vs fallback matrix (verified)
- Global policy anchors:
  - `lib/prisma.ts` enforces production DB requirement (`DATABASE_URL` must exist).
  - `lib/db-fallback.ts` allows fallback only outside production and blocks fallback store creation in production.
- Domain rules:
  - Provider config + API keys (`lib/api-key-service.ts`):
    - production: DB source of truth
    - local/dev: fallback store allowed when DB is unavailable
  - Conversations (`services/conversation-service.db.ts`):
    - production: DB source of truth
    - local/dev: fallback conversations for DB-unavailable and guest FK fallback flows
  - Goals (`services/goal-service.db.ts`):
    - production: DB source of truth; fallback reads/writes now gated, no fallback-store creation on successful DB reads
    - local/dev: fallback goals allowed for DB-unavailable and guest FK paths
  - Personas (`services/persona-service.db.ts`):
    - production: DB source of truth; fallback reads/writes now gated, no fallback-store creation on successful DB reads
    - local/dev: fallback personas allowed for DB-unavailable and guest FK paths
  - Analytics (`services/analytics-service.ts`):
    - production: DB source of truth (`memoryEvents` merge disabled when fallback is disallowed)
    - local/dev: fallback events allowed for DB-unavailable paths
  - Teams (`services/team-service.db.ts`) and configuration manager (`lib/config-manager.ts`):
    - production/local: DB-only behavior, no in-memory fallback branch
- Regression proof added:
  - `test/goal-service-db.test.ts`: production read path remains DB-first.
  - `test/persona-service-db.test.ts`: production read path remains DB-first.

## 07.3 production persistence ambiguity closure (verified)
- Production fail-closed behavior now enforced in fallback-capable services:
  - `lib/api-key-service.ts`: DB read/write failures now throw in production; no silent empty/null fallback responses.
  - `services/analytics-service.ts`: analytics DB failures now throw in production; no silent empty analytics payloads.
  - `services/conversation-service.db.ts`: FK/DB errors throw in production before fallback paths.
- Verification tests:
  - `test/api-key-service.test.ts` (production read/write fail-closed on DB unavailability)
  - `test/analytics-service.test.ts` (production analytics fail-closed)
  - `test/conversation-service-db.test.ts` (production FK-path fail-closed)
  - plus previously added production DB-first read tests for goals/personas
- Restart-proof evidence:
  - Two separate production-mode Node processes using Prisma adapter against local verification Postgres:
    - process A created user+goal+persona+conversation+message
    - process B read the same records and confirmed counts persisted (`1`, `1`, `1`, `1`)
  - Temporary proof records were deleted after verification.

## 07.4 migration path verification (verified)
- Verification DB: `multillm_verify_20260302` on `127.0.0.1:5432`.
- Commands executed in production-like mode:
  - `DATABASE_URL=postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302 npx prisma migrate status`
  - `DATABASE_URL=postgresql://d4ni3l@127.0.0.1:5432/multillm_verify_20260302 npx prisma migrate deploy`
  - post-deploy recheck with `migrate status`
- Observed outputs:
  - `Database schema is up to date!`
  - `No pending migrations to apply.`

## 08.1 provider registry truth (verified)
- Registry/type anchors:
  - `lib/providers/registry.ts`
  - `lib/providers/types.ts`
- Code-backed provider set:
  - OpenAI (`openai`)
  - Anthropic (`anthropic`)
  - Google AI (`googleai`)
  - OpenRouter (`openrouter`)
  - Grok (`grok`)
- Docs alignment:
  - `README.md` and `CLAUDE.md` both list the same five providers.

## 08.2 provider config route verification (verified)
- Verified routes:
  - `app/api/config/route.ts`
  - `app/api/provider-configs/route.ts`
  - `app/api/test-api-key/route.ts`
- Deterministic behavior updates:
  - `/api/config` now returns explicit JSON `500` on config lookup failure and delete failure.
  - `/api/test-api-key` now returns explicit JSON `500` on unexpected internal errors.
- Auth mode coverage:
  - strict mode: auth-forwarded `401` behavior validated in tests.
  - guest mode: tests assert route calls `getAuthenticatedUser({ allowGuest: true })`.
- Test evidence:
  - `test/api-config-route.test.ts`
  - `test/api-provider-configs-route.test.ts`
  - `test/api-test-api-key-route.test.ts`

## 08.3 key encryption contract verification (verified)
- Seed policy:
  - `lib/runtime-secrets.ts` enforces `API_KEY_ENCRYPTION_SEED` in production.
  - validated by `test/runtime-secrets.test.ts`.
- DB-backed encryption path:
  - `lib/api-key-service.ts`:
    - encrypt on store (`aesGcmEncrypt`)
    - decrypt on retrieval (`aesGcmDecrypt`)
    - provider-config listing excludes key material
  - validated by `test/api-key-service.test.ts` contract roundtrip case.
- Redaction and logging:
  - route payloads remain redacted (`apiKey: ''` in provider-config response paths).
  - key-operation route logs now avoid dumping raw error objects.

## 08.4 provider failure behavior verification (verified)
- Error mapping source:
  - `lib/providers/errors.ts`
- Verified deterministic mappings across chat + stream:
  - invalid key format -> `PROVIDER_KEY_FORMAT_INVALID` (`400`)
  - missing provider config/key -> `PROVIDER_NOT_CONFIGURED` (`400`)
  - upstream auth rejection (401/403) -> `PROVIDER_AUTH_ERROR` (`401`)
  - upstream rate limit (429) -> `RATE_LIMITED` (`429`)
  - provider timeout/abort -> `PROVIDER_TIMEOUT` (`504`)
  - malformed provider payload/body -> `PROVIDER_MALFORMED_RESPONSE` (`502`)
- Route-level tests:
  - `test/api-llm-chat-route.test.ts`
  - `test/api-llm-stream-route.test.ts`

## 09.1 chat route contract verification (verified)
- Route under test:
  - `app/api/llm/chat/route.ts`
- Verified contract areas:
  - auth forwarding (`401`)
  - guest-mode execution path
  - request validation failures
  - provider config/key preconditions
  - upstream failure mappings (auth, rate limit, timeout, malformed)
  - DB/service internal failure propagation
  - non-stream success response
- Test evidence:
  - `test/api-llm-chat-route.test.ts`

## 09.2 stream route contract verification (verified)
- Route under test:
  - `app/api/llm/stream/route.ts`
- Protocol contract:
  - NDJSON events: `chunk`, `done`, `error`
  - deterministic timeout/malformed stream error codes
- Client alignment:
  - `app/multi-chat/page.tsx` now consumes `/api/llm/stream` NDJSON
  - `services/stream-client.ts` uses `/api/llm/stream` with matching payload shape
- Test evidence:
  - `test/api-llm-stream-route.test.ts`
  - `test/stream-client.test.ts`

## 09.3 conversation persistence lifecycle verification (verified)
- Conversation route/service updates:
  - `app/api/conversations/[id]/route.ts` adds `PUT` rename/update support.
  - `services/conversation-service.db.ts` adds `updateConversationTitle()` with DB-first + fallback parity.
  - `lib/api-client.ts` adds `updateConversation()` API helper.
- UI contract updates:
  - `app/multi-chat/page.tsx` adds rename controls in recent conversation list.
  - Conversation actions now include explicit accessibility labels for reliable UI automation.
- Verified lifecycle coverage:
  - create
  - load
  - list
  - update/rename
  - delete
  - refresh persistence across browser reload
- Test evidence:
  - `test/api-conversations-routes.test.ts`
  - `test/conversation-service-db.test.ts`
  - `test/e2e/conversation-persistence.spec.ts`

## 09.4 main chat UI flow verification (verified)
- Page under test:
  - `app/multi-chat/page.tsx`
- Coverage goals verified:
  - loading state
  - empty state
  - successful send/stream render
  - provider stream-error render
  - refresh continuity
  - provider-model change behavior
- Test evidence:
  - `test/e2e/multi-chat-flow.spec.ts`

## 10.1 sidecar status decision (verified)
- Status:
  - Python sidecar is optional in the locked production topology.
- Scope effect:
  - core app readiness does not require sidecar availability.
  - orchestration bridge remains optional and must degrade safely.

## 10.2 optional sidecar isolation verification (verified)
- Route under test:
  - `app/api/llm/orchestrate/route.ts`
- Verified behavior:
  - sidecar success passthrough
  - fallback to local orchestration on sidecar 5xx, timeout abort, and network fetch failures
  - no fallback for sidecar 429 responses
  - auth forwarding and request validation behavior
- Test evidence:
  - `test/api-llm-orchestrate-route.test.ts`

## 11.1 goals feature verification (verified)
- Surfaces under test:
  - `app/api/goals/route.ts`
  - `app/api/goals/[id]/route.ts`
  - `app/goal-hub/page.tsx`
- Verified behavior:
  - list/create/get/update/delete route contract
  - validation and auth-forwarding behavior
  - goal-hub loading and empty states
  - create/update/delete + refresh UI flow
- Test evidence:
  - `test/api-goals-routes.test.ts`
  - `test/e2e/goal-hub-flow.spec.ts`

## 11.2 personas feature verification (verified)
- Surfaces under test:
  - `app/api/personas/route.ts`
  - `app/api/personas/[id]/route.ts`
  - `app/personas/page.tsx`
- Verified behavior:
  - list/create/get/update/delete route contract
  - validation and auth-forwarding behavior
  - personas loading and empty states
  - create/edit/delete/list UI flow
- Test evidence:
  - `test/api-personas-routes.test.ts`
  - `test/e2e/personas-flow.spec.ts`

## Code-verified provider support
From `lib/providers/*` and provider registration:
- OpenAI
- Anthropic
- Google AI
- OpenRouter
- Grok

Do not reduce this list back to four providers unless the code is changed.

## Runtime truth
### Database
`lib/prisma.ts` does **not** mean "stub-only runtime".
It does this:
- if `DATABASE_URL` is set, creates a real Prisma runtime client using `@prisma/adapter-pg`
- if `DATABASE_URL` is absent in non-production, creates a stub client and fallback paths may be used
- if `DATABASE_URL` is absent in production, app boot fails fast

### Auth
`proxy.ts` and `lib/auth.ts` together show:
- strict auth is always enforced in production
- guest/demo mode exists
- missing auth secret is fatal in strict mode and production
- credentials auth exists
- OAuth providers are conditional on env presence
- in-memory auth fallback is disabled in strict/production mode

### Python sidecar
The Python sidecar is **integrated**, not theoretical:
- `app/api/llm/orchestrate/route.ts` proxies to it
- local orchestration fallback exists when the sidecar is unavailable
- `src/core/main.py` provides health/chat/orchestrate endpoints
- `src/core/main.py` still has `# TODO: Add /api/v1/llm/stream endpoint`

Do not describe the sidecar as fully complete unless that TODO is removed and parity is tested.

## Existing docs that must not be trusted blindly
Reconcile these against code before using them as truth:
- `STATUS_UPDATE.md`
- `COMPLETION_REPORT.md`
- existing top-level `README.md`
- old `CLAUDE.md`

## Mandatory working mode for future edits
1. Read `.currentstatus`.
2. Follow `CLOSURE_MASTER_CHECKLIST.md` in order.
3. Update docs only after code truth is known.
4. Every completion claim must include evidence.
5. Mark all unverified items explicitly.

## Commands defined by repository
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run type-check`
- `npm run test:run`
- `npm run smoke`
- `npm run verify:prod`

## Minimum output standard for the next LLM
When reporting status, always separate:
- OBSERVED
- VERIFIED IN THIS SESSION
- UNVERIFIED
- BLOCKERS
- NEXT ACTIONS

Do not merge those categories. That is how repos turn into lying landfill.
