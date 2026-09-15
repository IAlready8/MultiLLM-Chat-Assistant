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
- Auth (1):
  - `app/api/auth/[...nextauth]/route.ts`
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
- Auth pages (4):
  - `app/auth/error/page.tsx`
  - `app/auth/register/page.tsx`
  - `app/auth/signin/page.tsx`
  - `app/auth/signout/page.tsx`
- Admin pages (2):
  - `app/admin/errors/page.tsx`
  - `app/admin/status/page.tsx`

## 02.3 production scope decision
Every visible surface is explicitly classified.

- Core:
  - Home shell: `app/page.tsx`
  - Auth UX/routes: `app/auth/error/page.tsx`, `app/auth/register/page.tsx`, `app/auth/signin/page.tsx`, `app/auth/signout/page.tsx`, `app/api/auth/[...nextauth]/route.ts`
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
| Auth UX/routes | sign-in/register/sign-out/error routes function; session route works | users and linked accounts are durable in production | real session required in every environment | invalid credentials/OAuth failure are explicit |
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
- Mandatory auth: required in every environment.
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
| OAuth providers (Google/GitHub) | Required for self-service account creation | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | `lib/auth.ts`; `lib/auth-policy.ts` | Existing password accounts can sign in, but new users cannot create accounts |
| Stripe billing | Optional | `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXTAUTH_URL` | `lib/stripe.ts`; `app/api/subscriptions/route.ts`; `app/api/subscriptions/manage/route.ts`; `app/api/webhooks/stripe/route.ts` | Billing routes return explicit 503 config errors |
| Python sidecar | Optional | `PYTHON_CORE_URL` | `app/api/llm/orchestrate/route.ts:8,198,243-277` | Orchestrate route falls back to local orchestration with fallback headers |
| Redis | Optional | `REDIS_URL` | `lib/rate-limit.ts:36-52,139-147`; `lib/cache.ts:106-126` | Cache/rate-limit degrade to in-memory behavior |

## 03.3 fallback enforcement status
- Production DB fallback is disabled via fail-fast boot when `DATABASE_URL` is missing (`lib/prisma.ts`).
- Authentication requires a real session in every environment (`lib/api-auth.ts`, `proxy.ts`).
- Credentials auth verifies existing password hashes and never creates users (`lib/credentials-auth.ts`).
- In-memory DB fallback helpers now block fallback creation in production (`lib/db-fallback.ts`), including analytics fallback writes (`services/analytics-service.ts`).

## 04.1 env contract audit

### `.env.example` classification
- Required-all (locked production):
  - `DATABASE_URL`
  - `NEXTAUTH_SECRET` (or `AUTH_SECRET` as alternate)
  - `NEXTAUTH_URL`
  - `AUTH_OWNER_EMAILS`
  - `API_KEY_ENCRYPTION_SEED`
- Required-conditional:
  - Self-service account creation: one complete Google or GitHub OAuth credential pair
  - Python sidecar direct provider keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
  - Redis enabled: `REDIS_URL`
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
- authentication is mandatory in every environment
- missing auth secret is fatal at runtime
- credentials auth is login-only for existing password users
- OAuth providers create durable accounts when their complete env pair is present
- demo, guest, implicit-registration, and in-memory auth fallbacks are removed

### Python sidecar
The Python sidecar is **integrated**, not theoretical:
- `app/api/llm/orchestrate/route.ts` proxies to it
- local orchestration fallback exists when the sidecar is unavailable
- `src/core/main.py` provides health/chat/orchestrate/stream endpoints

Do not describe the sidecar as fully complete unless streaming parity is tested
against the Next.js stream route behavior.

## Existing docs that must not be trusted blindly
Reconcile these against code before using them as truth:
- `STATUS_UPDATE.md`
- `COMPLETION_REPORT.md`
- existing top-level `README.md`
- old `CLAUDE.md`

## Mandatory working mode for future edits
1. Read `handoff_work/RELEASE_STATUS.md`.
2. Follow `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md` as the only current forward plan.
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
