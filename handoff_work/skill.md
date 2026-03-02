# .skill

name: multillm-chat-assistant-repo-closure
repo_remote: https://github.com/IAlready8/MultiLLM-Chat-Assistant.git
observed_head: 3a5081be3a69f57cbf56c06d179f58d85eec4b03
observed_branch: codex/protected-main-push-20260302
purpose: >
  Evidence-only working instructions for an LLM or operator finishing this repository
  to handoff-ready state without inventing project facts.

## Non-negotiable rules
1. No assumptions. Every claim must be traceable to:
   - a file path in this repo, or
   - a command output captured during the current session.
2. Do not trust top-level docs by default. Reconcile them against code first.
3. Production claims require proof. "Should work" is not proof.
4. A feature is not supported just because a page exists. It must have:
   - backing route/service logic,
   - data behavior defined,
   - tests or executable verification.
5. If a surface is incomplete, label it `optional`, `experimental`, or `out of scope`. Do not market it as complete.
6. Do not leave runtime topology ambiguous. Choose and document one official production shape.
7. Do not treat in-memory fallback as acceptable production persistence unless explicitly approved and documented.
8. Do not rewrite status files to sound good. Record exact truth, including what was not verified.

## Repository facts observed directly
- Frontend/runtime stack from `package.json`:
  - Next.js `^16.1.1`
  - React `18`
  - TypeScript `^5`
  - Tailwind CSS
  - Radix UI
  - NextAuth `^4.24.7`
  - Prisma `^7.3.0`
  - PostgreSQL adapter `@prisma/adapter-pg`
  - Stripe `^20.0.0`
  - Playwright present in devDependencies
  - Vitest present in devDependencies
- Route files observed (22), grouped for `02.2`:
  - Auth (2):
    - app/api/auth/[...nextauth]/route.ts
    - app/api/auth/upgrade-guest/route.ts
  - Config (3):
    - app/api/config/route.ts
    - app/api/provider-configs/route.ts
    - app/api/test-api-key/route.ts
  - LLM (3):
    - app/api/llm/chat/route.ts
    - app/api/llm/orchestrate/route.ts
    - app/api/llm/stream/route.ts
  - CRUD domain (7):
    - app/api/analytics/route.ts
    - app/api/conversations/[id]/route.ts
    - app/api/conversations/route.ts
    - app/api/goals/[id]/route.ts
    - app/api/goals/route.ts
    - app/api/personas/[id]/route.ts
    - app/api/personas/route.ts
  - Billing (3):
    - app/api/subscriptions/manage/route.ts
    - app/api/subscriptions/route.ts
    - app/api/webhooks/stripe/route.ts
  - Admin (2):
    - app/api/admin/errors/stats/route.ts
    - app/api/admin/status/route.ts
  - Ops (1):
    - app/api/health/route.ts
  - Team (1):
    - app/api/teams/route.ts
- Page files observed (16), grouped for `02.1`:
  - Product pages (11):
    - app/ai-roundtable/page.tsx
    - app/analytics/page.tsx
    - app/api-test/page.tsx
    - app/billing/page.tsx
    - app/comparison/page.tsx
    - app/goal-hub/page.tsx
    - app/multi-chat/page.tsx
    - app/page.tsx
    - app/personas/page.tsx
    - app/pipeline/page.tsx
    - app/settings/page.tsx
  - Auth pages (3):
    - app/auth/error/page.tsx
    - app/auth/signin/page.tsx
    - app/auth/signout/page.tsx
  - Admin pages (2):
    - app/admin/errors/page.tsx
    - app/admin/status/page.tsx
- Service files observed (15):
  - services/analytics-service.ts
  - services/api-client.ts
  - services/api-service.ts
  - services/conversation-service.db.ts
  - services/conversation-service.ts
  - services/conversation-storage.ts
  - services/export-import-service.ts
  - services/goal-service.db.ts
  - services/ndjson.ts
  - services/persona-service.db.ts
  - services/persona-service.ts
  - services/persona-storage.ts
  - services/server-api-client.ts
  - services/stream-client.ts
  - services/team-service.db.ts
- Provider files observed (10):
  - lib/providers/anthropic.ts
  - lib/providers/errors.ts
  - lib/providers/googleai.ts
  - lib/providers/grok.ts
  - lib/providers/index.ts
  - lib/providers/openai.ts
  - lib/providers/openrouter.ts
  - lib/providers/registry.ts
  - lib/providers/types.ts
  - lib/providers/util.ts
- Test files observed (30):
  - test/analytics-service.test.ts
  - test/api-admin-errors-stats-route.test.ts
  - test/api-admin-status-route.test.ts
  - test/api-analytics-route.test.ts
  - test/api-auth.test.ts
  - test/api-config-route.test.ts
  - test/api-conversations-routes.test.ts
  - test/api-goals-routes.test.ts
  - test/api-health-route.test.ts
  - test/api-llm-chat-route.test.ts
  - test/api-llm-stream-route.test.ts
  - test/api-personas-routes.test.ts
  - test/api-provider-configs-route.test.ts
  - test/api-stripe-webhook-route.test.ts
  - test/api-subscriptions-routes.test.ts
  - test/api-test-api-key-route.test.ts
  - test/api-upgrade-guest-route.test.ts
  - test/config-schemas.test.ts
  - test/conversation-service-db.test.ts
  - test/db-fallback.test.ts
  - test/e2e/auth-flow.spec.ts
  - test/e2e/provider-configuration.spec.ts
  - test/goal-service-db.test.ts
  - test/guest-migration.test.ts
  - test/middleware-auth-routing.test.ts
  - test/persona-service-db.test.ts
  - test/provider-key-test.test.ts
  - test/provider-runtime.test.ts
  - test/runtime-secrets.test.ts
  - test/stripe-lib.test.ts
- Workflow files observed:
  - .github/workflows/ci.yml
  - .github/workflows/claude-code-review.yml
  - .github/workflows/claude.yml

## Runtime and architecture facts observed directly
- `lib/prisma.ts`:
  - uses real Prisma runtime client when `DATABASE_URL` is set
  - uses stub client when `DATABASE_URL` is absent
- `proxy.ts`:
  - guest/demo mode allowed when strict auth flags are false
  - strict auth requires JWT and configured auth secret
- `lib/auth.ts`:
  - credentials auth exists
  - demo account path exists
  - in-memory auth fallback exists
  - OAuth providers are conditional on env presence
- `app/api/llm/orchestrate/route.ts`:
  - proxies to Python sidecar
  - falls back to local orchestration on timeout/network/5xx class failure
- `src/core/main.py`:
  - FastAPI sidecar exposes health, chat, orchestrate
  - stream endpoint is explicitly TODO
- `scripts/smoke-test.sh` and `scripts/verify-production.sh` exist and are intended as release gates
- CI workflow exists in `.github/workflows/ci.yml`

## External systems matrix (03.2)
- Required in locked production:
  - PostgreSQL (`DATABASE_URL`) for durable persistence/auth adapter paths.
  - Auth secret (`NEXTAUTH_SECRET` or `AUTH_SECRET`) for strict/prod session integrity.
  - Provider credentials/config with encryption seed (`API_KEY_ENCRYPTION_SEED`) for real LLM calls.
- Optional:
  - Google/GitHub OAuth env pairs (provider buttons omitted when absent).
  - Stripe env set (`STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXTAUTH_URL`); billing routes return 503 config errors when absent.
  - Python sidecar URL (`PYTHON_CORE_URL`); orchestrate route falls back locally when sidecar unavailable.
  - Redis (`REDIS_URL`); cache/rate-limit degrade to in-memory when absent.

## Env audit (04.1)
- Required-all: `DATABASE_URL`, `NEXTAUTH_SECRET` (or `AUTH_SECRET`), `NEXTAUTH_URL`, `API_KEY_ENCRYPTION_SEED`.
- Required-conditional:
  - OAuth pairs (`GOOGLE_*`, `GITHUB_*`) when OAuth enabled.
  - Demo/guest vars when non-production demo mode enabled.
  - Sidecar direct provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`) when sidecar key mode is used.
  - `REDIS_URL` when Redis-backed cache/rate limiting is enabled.
- Optional: strict-auth toggles (`AUTH_REQUIRE_LOGIN`, `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`) for non-production behavior control.
- Dead/legacy in current runtime: DB pool tuning vars, OpenRouter env key, rate-limit vars in `.env.example`, performance/circuit-breaker vars, `SECURE_STORAGE_SECRET`.
- Used by runtime/scripts but missing from `.env.example`: `AUTH_SECRET`, Stripe env vars, `PYTHON_CORE_URL`, `LLM_FETCH_*`, `NEXT_PUBLIC_APP_*`, demo `NEXT_PUBLIC_*` mirrors, `NEXT_PUBLIC_SECURE_STORAGE_KEY`.

## Startup validation (04.2)
- Production startup env checks are centralized in `lib/startup-validation.ts`.
- Checks are executed from `lib/prisma.ts` and `lib/auth.ts`.
- Production now fails fast on missing required core envs; optional integrations only validate when enabled.
- Test evidence: `test/startup-validation.test.ts` plus targeted auth/fallback suites.

## Known doc/code mismatches already observed
- `STATUS_UPDATE.md` branch name does not match `.git/HEAD`.
- Existing `CLAUDE.md` omits Grok support and understates Python sidecar integration.
- `COMPLETION_REPORT.md` is stale relative to current code shape.
- `README.md` wording around Prisma/runtime is incomplete because `lib/prisma.ts` supports a real DB runtime when env is set.

## Required workflow for the next LLM
1. Read `.currentstatus` first.
2. Execute the checklist in `CLOSURE_MASTER_CHECKLIST.md` in order.
3. Update `.plan` after each closed task group.
4. Whenever a task is marked done, attach evidence:
   - exact command
   - exact output
   - exact files changed
5. Never collapse "optional" and "supported" into the same state.

## Minimal command set already defined by repo
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run type-check`
- `npm run test:run`
- `npm run smoke`
- `npm run verify:prod`

## Closure target
Handoff-ready means:
- one official production topology is declared
- all supported features are verified
- incomplete features are demoted or finished
- docs match code
- deploy, verify, and rollback are proven
- no known Sev-1 / Sev-2 blocker remains open
