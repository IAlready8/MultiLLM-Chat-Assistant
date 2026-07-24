# Implementation Status Ledger

Durable, evidence-based status for the multi-LLM application. Update during work, not only at the end.
Last updated: 2026-07-24 (session: pilot completion & hardening).

## Repository state (verified)

- Verified `origin/main`: `68273ed6082f825299d98c7c3be2e990edc9ec86` (unchanged during session; matches prior handoff notes).
- Active implementation branch: `feat/pilot-completion-hardening` (branched from `origin/main`).
- Working tree at session start: clean checkout of `main` (the previously reported dirty checkout with 3 unpushed commits is NOT present in this environment; it lives on the owner's local machine and was not touched).
- PR #123 (`codex/private-pilot-existing-work` @ `27f2936`): open, draft, mergeable. Contains the ONLY copies of `docs/STEP11_PRIVATE_PILOT_PLAN.md`, `docs/templates/step11-private-pilot-tracker.csv`, `scripts/create-private-pilot-invite.mjs`, `scripts/validate-private-pilot-tracker.mjs`. Not duplicated here; preserved untouched.
- PR #124 (`codex/dependency-ci-hardening` @ `57d342f`): open, draft. Dependency work kept isolated; not touched.

## Vercel preview failure — root cause classification

- PR #123 checks: Quality Checks ✅, Security Audit ✅, Smoke Tests ✅, Vercel ❌ (`dpl_Z5dKWjRt9yfwESupLey7AeUYdaLZ`).
- Evidence: Vercel deployments FAIL on `main` itself (commits `68273ed`, `2384c76`) — failure predates PR #123.
- Local reproduction: `npm run build` with required env vars → SUCCESS (exit 0). Same build WITHOUT env vars → FAILS during "collect page data" with `Startup environment validation failed: DATABASE_URL / NEXTAUTH_SECRET / NEXTAUTH_URL / API_KEY_ENCRYPTION_SEED required in production`.
- Classification: **pre-existing repository/deployment configuration — missing environment variables in the Vercel project. Not caused by PR #123.**
- Required to resolve (owner/Vercel access): set `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `API_KEY_ENCRYPTION_SEED` (plus optional provider vars) in the Vercel project for preview + production, then redeploy. Confirm with a green deployment; do not disable the integration.

## Defects fixed this session

1. **P0 — Comparison metrics permanently 0 in production** (`services/conversation-service.db.ts`):
   `getComparisonReadyConversationCountByUserId` and `getWeeklySavedBriefComparisonCountByUserId` computed the in-memory fallback count via `getOrCreateUserStore`, which throws `In-memory database fallback is disabled in production.` before the DB query ran. Result: `comparisonReadyConversations` and `weeklySavedBriefComparisons` (the locked Step 11 KPI) were always 0 for every production user, breaking the activation funnel and pilot success measurement. Fix: read-only `peekFallbackUserStore` (mirrors the persona-service pattern); counts now come from Postgres in production. Regression test added (production-mode counts resolve from DB without throwing).

2. **P1 — `comparison_ready_conversation_saved` undercounted** (`app/api/conversations/route.ts`):
   The event fired only from POST `/api/conversations/[id]` (add messages). Conversations created already containing provider-tagged assistant messages (import/API path) never emitted it, so Step 11 outbound metrics undercounted. Fix: create route now emits the same event with identical payload/attribution semantics. Test added.

## Validation results (this branch)

- Lint (`eslint --max-warnings=0`): PASS
- Type check (`tsc --noEmit`): PASS
- Unit/integration tests (vitest): 48 files, 318/318 PASS
- Production build (`npm run build`): PASS
- Migrations: `prisma migrate deploy` applied cleanly on fresh Postgres 15 (single init migration; no schema changes made this session)
- End-to-end (live, production build + Postgres + real LLM calls via OpenAI-compatible endpoint): sign-in/registration ✅, provider config persistence + key never echoed back ✅, persona CRUD ✅, `/api/llm/chat` real response ✅, `/api/llm/stream` NDJSON streaming ✅, conversation save + refresh persistence ✅, cross-user ownership (404) ✅, invite attribution cookie → analytics events ✅, analytics dashboard shows non-zero Weekly Saved Brief Comparisons + 100% activation funnel ✅
- CI / Vercel preview: not run from this environment; see classification above.

## Private-pilot readiness (verified against live app)

- `/settings` provider setup: WORKING (server-side encrypted storage, connection test, key never returned to browser)
- `/personas`: WORKING (create/edit/persist/ownership)
- `/multi-chat`: WORKING (real streamed responses, save conversation, refresh persistence)
- `/comparison`: WORKING (ownership-enforced retrieval, provider/model attribution)
- `/analytics` + Weekly Saved Brief Comparisons: WORKING after P0 fix (was silently broken in production)
- Invite attribution (`?source=&campaign=&cohort=` → 30-day cookie → event payloads → Founder Outbound funnel): WORKING
- Invite generator + tracker validation: lives on PR #123 only; merge PR #123 to get `pilot:invite` / `pilot:validate` commands.

## Known issues / next actions (priority order)

1. Configure Vercel project env vars and verify a green preview deployment (owner action; blocks release).
2. Decide on merging PR #123 (mergeable; brings pilot docs/scripts to main) — owner approval required.
3. Continue dependency hardening exclusively via PR #124 path (~127 findings reported on default branch; not addressed here by design).
4. Auth rate limiting is in-memory per instance (`lib/rate-limit.ts` usage in `lib/auth.ts`); consider Redis-backed limiter for multi-instance production.
5. Persona API response uses `title`/`prompt` while accepting `name`/`systemPrompt` on input — schema naming consistency follow-up.

## Owner-approval gates (not performed)

No merge, no production deployment, no branch deletion, no secret rotation, no real invitations were executed this session.
