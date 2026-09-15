# MultiLLM Chat Assistant Agent Instructions

## Mission

This is a real production-oriented multi-provider LLM workspace. Treat every change as if it may affect authentication, provider-key security, billing, persistence, production deployment, or handoff evidence. Work surgically, verify aggressively, and never invent behavior that is not present in code.

The correct default is: inspect first, plan when risk is non-trivial, change the smallest safe surface, test what changed, report only facts.

## Current Codebase Facts

- App: MultiLLM Chat Assistant.
- Primary stack: Next.js 16 App Router, React 18, TypeScript strict, Tailwind CSS, Radix-style UI primitives, Framer Motion where already used.
- API layer: Next.js Route Handlers under `app/api/**/route.ts`.
- Auth: NextAuth v4 plus custom helpers in `lib/auth.ts`, `lib/api-auth.ts`, `lib/demo-account.ts`, and `proxy.ts`.
- Data layer: Prisma 7 with PostgreSQL as the production database.
- Billing: Stripe in `lib/stripe.ts`, `app/api/subscriptions/*`, and `app/api/webhooks/stripe/route.ts`.
- LLM runtime: provider adapters in `lib/providers/*`, metadata in `lib/provider-registry.ts`, model catalog in `lib/model-catalog.ts`.
- Supported provider IDs currently include: `openai`, `openrouter`, `anthropic`, `googleai`, `grok`, `ollama`, `mistral`.
- Optional Python sidecar: `src/core/*`, reached by `app/api/llm/orchestrate/route.ts` through `PYTHON_CORE_URL`.
- Optional Redis: cache/rate-limit degradation paths in `lib/cache.ts` and `lib/rate-limit.ts`.
- Tests: Vitest/jsdom in `test/`, Playwright specs in `test/e2e/`, pytest/Python integration tests in `tests/`.
- Deployment target: Vercel. Production proof and operator steps live in docs/handoff files.

## Package Manager and Runtime Rules

- Use npm as the package manager.
- `package-lock.json` is the source-of-truth lockfile.
- `pnpm-lock.yaml` is archival. Do not update it unless explicitly asked.
- Use Node 20+.
- Do not introduce Docker, Docker Compose, containers, or container-first workflows.
- `docker-compose.local.yml` may exist in the repo; do not expand or rely on it unless explicitly requested.
- Avoid heavy local services. Optimize for native macOS / Apple Silicon workflows.
- Do not add dependencies unless the need is concrete and smaller existing options are insufficient.

## Source of Truth Order

When repo facts conflict, use this priority:

1. Current source code.
2. `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `prisma/schema.prisma`.
3. `DOCS_SOURCE_OF_TRUTH.md`.
4. `README.md` and `ARCHITECTURE.md`.
5. `docs/OPERATOR_RUNBOOK.md`, `docs/DEPLOYMENT_GUIDE.md`, `VERCEL_DEPLOYMENT.md`.
6. `handoff_work/HANDOFF_INDEX.md`, `RELEASE_STATUS.md`, `RELEASE_MANIFEST.md`, `DEPLOYMENT_EVIDENCE.md`, `BILLING_EVIDENCE.md`, `RESIDUAL_RISKS.md`.
7. Historical docs only when explicitly requested.

Treat `STATUS_UPDATE.md` and `COMPLETION_REPORT.md` as historical snapshots, not current truth.

Never update handoff, release, billing, deployment, or proof documents unless you have current command output or user-provided evidence to support the change.

## Repository Map

- `app/`: App Router pages, layouts, loading/error boundaries, and API routes.
- `app/api/`: server route handlers for auth, LLMs, config, provider keys, conversations, goals, personas, analytics, billing, health, admin status, teams.
- `components/`: reusable React components and feature components.
- `components/ui/`: shared UI primitives. Check here before creating new primitives.
- `hooks/`: client hooks for conversations, goals, personas, etc.
- `lib/`: auth, provider runtime, crypto, logging, cache, rate limits, Prisma, Stripe, runtime/env validation, shared utilities.
- `lib/providers/`: provider adapters. Keep adapter contracts unified.
- `services/`: client/server domain services, persistence services, analytics, NDJSON stream parsing, export/import.
- `prisma/`: schema and migrations.
- `src/core/`: optional Python orchestration sidecar.
- `test/`: Vitest + Testing Library + Playwright tests.
- `tests/`: Python and cross-stack integration tests.
- `scripts/`: local verification, smoke, deployment, env, reliability, hygiene tooling.
- `docs/` and `handoff_work/`: operator, release, proof, and buyer handoff documentation.

Generated/build folders such as `.next/`, `.vercel/`, `coverage/`, `playwright-report/`, `test-results/`, and package manager caches are not source. Do not edit or rely on them.

## Product Scope Classification

Core supported surfaces:

- Home shell: `app/page.tsx`.
- Auth: `app/auth/*`, `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/upgrade-guest/route.ts`.
- Chat and conversations: `app/multi-chat/page.tsx`, `app/api/llm/chat/route.ts`, `app/api/llm/stream/route.ts`, `app/api/conversations/*`.
- Provider settings/config: `app/settings/page.tsx`, `app/api/config/route.ts`, `app/api/provider-configs/route.ts`, `app/api/test-api-key/route.ts`.
- Goals: `app/goal-hub/page.tsx`, `app/api/goals/*`.
- Personas: `app/personas/page.tsx`, `app/api/personas/*`.
- Analytics: `app/analytics/page.tsx`, `app/api/analytics/route.ts`.
- Health: `app/api/health/route.ts`.

Optional surfaces:

- Billing and Stripe flows.
- Python orchestration bridge.
- API test page.

Experimental surfaces:

- Comparison UI.
- Pipeline UI.
- AI Roundtable UI.
- Admin status/error pages and routes.
- Teams API, unless `ENABLE_TEAMS_API=true` and the task explicitly covers it.

Never silently promote experimental code to supported production scope.

## Commands

Prefer these exact commands when available:

```bash
npm ci
npm run dev
npm run type-check
npm run lint
npm run test:run
npm run test:coverage
npm run build
npm run validate:all
npm run check:hygiene
npm run env:validate
npm run smoke
npm run reliability:check
npm run verify:prod
```

Build/dev defaults:

- `npm run dev` uses webpack mode through `dev:webpack`.
- `npm run build` uses webpack mode through `build:webpack` and runs `prisma generate`.
- Turbopack commands exist for migration validation only: `dev:turbopack`, `build:turbopack`.

For Python sidecar work:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest tests
```

Do not invent scripts. If a command is unavailable or fails because env is missing, report the exact blocker.

## Validation Gates

Use the smallest meaningful gate for the change:

- TypeScript-only logic: `npm run type-check` plus relevant Vitest file(s).
- Route/API behavior: relevant route tests plus `npm run type-check`.
- UI behavior: relevant component/page tests plus manual/browser verification when possible.
- Auth/session changes: auth tests, middleware/proxy tests, strict-auth and guest-mode reasoning.
- Provider adapter changes: provider runtime tests, route tests, streaming/non-streaming checks.
- Prisma/schema changes: migration review, `npx prisma generate`, relevant DB service tests.
- Billing changes: Stripe lib tests, subscription/webhook route tests, no live Stripe calls unless explicitly requested.
- Health/reliability changes: `npm run reliability:check` or the underlying reliability script.
- Deployment/runtime/env changes: `npm run env:validate`, `npm run verify:prod`, `npm run smoke` where env permits.
- Broad changes: `npm run validate:all` if practical.

Never claim a check passed unless it actually ran and passed.

## Hard Safety Rules

Do not do these without explicit user approval:

- Delete source files or directories.
- Run destructive commands.
- Modify `.env`, `.env.local`, or secret files.
- Print, log, expose, or commit secrets.
- Modify production deployment settings.
- Modify billing/payment behavior.
- Modify authentication/session behavior.
- Edit existing database migrations.
- Push, force-push, merge, deploy, promote, publish, or release.
- Add Docker/container tooling.
- Rewrite large sections of the app.
- Change test expectations merely to make failing tests pass.

If a requested task requires one of these, stop and explain the needed approval.

## Security Rules

This repo handles user provider API keys, auth sessions, billing records, analytics, and production environment contracts. Assume security regressions are high impact.

Always preserve:

- AES-GCM API key encryption flow using `API_KEY_ENCRYPTION_SEED`.
- No plaintext provider key leakage in logs, responses, analytics, tests, screenshots, or errors.
- Strict production auth enforcement.
- Guest/demo behavior only outside production.
- Production DB fail-fast behavior when `DATABASE_URL` is absent.
- Explicit 4xx/5xx JSON error bodies with machine-readable `code` when routes already use that pattern.
- Stripe webhook signature verification.
- Sanitized logging via existing logger/sanitizer utilities.
- Fallbacks that are honest, bounded, and non-production-safe only where intended.

Check for:

- input validation at route boundaries,
- auth/ownership checks on user-owned records,
- provider-key access isolation by `userId`,
- unsafe redirects,
- injection risks,
- excessive permissions,
- unbounded in-memory growth,
- accidental client exposure of server-only env vars,
- dependency risks.

## API Route Pattern

For route handlers:

1. Authenticate with `getAuthenticatedUser(...)` unless the route is intentionally public.
2. Parse JSON safely.
3. Validate inputs with existing Zod/schema patterns or explicit guards.
4. Enforce user ownership before reading/modifying user-owned records.
5. Call domain services instead of duplicating persistence logic.
6. Return deterministic JSON errors with stable status and `code`.
7. Record analytics only through safe wrappers; analytics failure must not crash core request paths unless the route is specifically analytics-critical.
8. Never leak stack traces or secrets to clients.

Follow existing response conventions in nearby route files before adding new helpers.

## Provider Runtime Rules

Provider adapters must conform to `lib/providers/types.ts`.

When adding or changing a provider:

1. Update adapter implementation in `lib/providers/<provider>.ts`.
2. Register it in `lib/providers/registry.ts`.
3. Update `ProviderId` in `lib/providers/types.ts`.
4. Update display metadata in `lib/provider-registry.ts`.
5. Update model defaults/rate limits in `lib/config-schemas.ts` and model listings in `lib/model-catalog.ts` when applicable.
6. Update tests for provider runtime, key format, route behavior, and streaming if affected.

Keep provider errors flowing through `classifyProviderError()` where possible.

Streaming rules:

- `/api/llm/chat` with `stream: true` returns raw `text/plain` chunks.
- `/api/llm/stream` returns NDJSON events.
- Client NDJSON parsing lives in `services/ndjson.ts`.
- Do not mix stream formats without updating clients and tests.

## Persistence Rules

Production persistence is PostgreSQL via Prisma. Do not design production paths around in-memory fallback.

- Prisma schema: `prisma/schema.prisma`.
- Core DB helper: `lib/prisma.ts`.
- Fallback policy: `lib/db-fallback.ts`.
- DB services: `services/*-service.db.ts`.
- Type helpers: `types/prisma.ts`.

When changing schema:

1. Explain the data migration impact.
2. Add a new migration; do not edit existing applied migrations.
3. Run or request `npx prisma generate`.
4. Update service tests.
5. Update `.env.example` or docs only when contracts actually change.

## Auth Rules

Production strict auth is mandatory. Do not weaken it.

Key files:

- `lib/auth.ts`
- `lib/api-auth.ts`
- `lib/demo-account.ts`
- `lib/session-cookie.ts`
- `proxy.ts`
- `types/next-auth.d.ts`

Preserve these behaviors:

- production requires valid auth/session configuration,
- `NEXTAUTH_SECRET` or `AUTH_SECRET` is required in production,
- guest/demo mode is local/dev only,
- JWT/session failures degrade to unauthenticated where intended, not 500s,
- user-owned records are scoped by authenticated user ID.

## Billing Rules

Billing is optional but security-sensitive.

Key files:

- `app/billing/page.tsx`
- `app/billing/billing-client.tsx`
- `app/api/billing/view/route.ts`
- `app/api/subscriptions/route.ts`
- `app/api/subscriptions/manage/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `lib/stripe.ts`
- `lib/billing-plans.ts`
- `lib/billing-source.ts`

Preserve:

- explicit 503 configuration errors when Stripe is not configured,
- signed webhook verification,
- no fake billing-ready claims,
- no live Stripe calls during tests unless explicitly requested,
- no subscription mutation without authenticated user context or verified webhook event context.

## UI and Design Rules

Use existing primitives before creating new ones:

- `components/ui/*`
- `components/navbar.tsx`
- `components/mobile-menu.tsx`
- `components/error-boundary.tsx`
- feature components in `components/`

UI conventions:

- Use Tailwind and semantic CSS variables from `app/globals.css` / `tailwind.config.ts`.
- Use `cn()` from `lib/utils.ts` for class merging.
- Preserve dark/light theme support through `next-themes` and class strategy.
- Preserve accessibility basics: semantic elements, labels, keyboard navigation, focus states, color contrast.
- Keep responsive behavior intact.
- Avoid generic SaaS redesigns unless requested; this project can support sharper dark high-contrast UI, but do not randomly restyle unrelated surfaces.

For UI changes, include screenshots or describe manual verification when possible.

## Testing Rules

Test locations:

- Unit/integration TS tests: `test/*.test.ts` and `test/*.test.tsx`.
- E2E tests: `test/e2e/*.spec.ts`.
- Python tests: `tests/*.py`.
- Cross-stack test templates: `tests/*.ts`.

Rules:

- Mock external networks and provider APIs.
- Avoid flaky timers.
- Do not call real LLM providers, Stripe, OAuth providers, Vercel, or production URLs unless explicitly requested.
- Add regression tests for bug fixes when practical.
- Keep tests focused on externally observable behavior.
- Do not loosen assertions to hide failures.

## Documentation Rules

Documentation must reflect verified code behavior.

Current authoritative docs are declared in `DOCS_SOURCE_OF_TRUTH.md`. Before editing docs, check whether the target doc is current or historical.

Do not update release evidence, billing evidence, deployment proof, production URLs, commit hashes, PR numbers, or smoke-test counts unless the user provided proof or you generated proof in the current session.

When code behavior changes, update the smallest relevant doc:

- setup/scripts: `README.md`, `docs/OPERATOR_RUNBOOK.md`.
- architecture/contracts: `ARCHITECTURE.md`, `DOCUMENTATION.md`.
- deployment: `VERCEL_DEPLOYMENT.md`, `docs/DEPLOYMENT_GUIDE.md`.
- security: `docs/SECURITY_POSTURE.md`, `docs/THREAT_MODEL.md`, `SECURITY_AUDIT_TRIAGE.md`.
- handoff/release: only with evidence.

## Implementation Workflow

For any task:

1. Run or inspect `git status --short` if inside a git checkout.
2. Identify the exact affected surface.
3. Read the relevant source and adjacent tests before editing.
4. Prefer a surgical patch.
5. Preserve existing public behavior unless the task explicitly changes it.
6. Update or add tests where behavior changes.
7. Run the narrowest meaningful validation.
8. Report files changed, commands run, results, and remaining risk.

For non-trivial changes, produce a plan before editing when:

- more than 8 files may change,
- auth/billing/persistence/deployment/security is touched,
- schema or env contracts change,
- public API contracts change,
- experimental surfaces are promoted or removed,
- the requested behavior conflicts with current docs or tests.

## Debugging Workflow

For bugs/failures:

1. Capture the exact failure text.
2. Locate the relevant route/component/service/provider.
3. Trace the data path end-to-end.
4. State the root cause.
5. Propose the smallest fix.
6. Add a regression test when practical.
7. Validate with targeted tests first, broad checks second.

Do not patch symptoms. Do not hide errors behind broad `try/catch` blocks. Do not convert real failures into fake success states.

## Code Style

- TypeScript strict mode is enabled.
- Use `@/*` path alias for repo-root imports.
- Prefer explicit types at module boundaries.
- Avoid `any`; if unavoidable, keep it local and justified.
- Use kebab-case filenames for utilities/services/components already following that style.
- Use hooks named `use-*.ts`.
- Follow existing route/service/component patterns before inventing abstractions.
- Keep modules focused.
- Avoid one-letter names except trivial local loops.
- Keep comments useful and current; remove misleading comments.

## Forbidden Cleanup Traps

Do not “clean up” these just because they look odd:

- dual package locks, because `pnpm-lock.yaml` is archival while `package-lock.json` is active.
- optional Python sidecar, because core app remains valid without it.
- optional Redis paths, because degraded behavior is part of reliability contract.
- guest/demo local mode, because it is intentional outside production.
- experimental pages, unless the task explicitly changes product scope.
- handoff/release docs, unless evidence supports the update.
- placeholder Stripe key pattern in `lib/stripe.ts`, because guards prevent outbound calls when unconfigured.

## Completion Format

End every technical task with:

- Files changed
- What changed
- Validation run
- Validation result
- Remaining risks / manual steps

Keep it factual. Do not claim completion beyond what was verified.
