# Next.js Upgrade Playbook

## Objective
Upgrade from Next.js 14.x to the latest safe major with zero regression in:
- auth/session behavior
- provider chat + streaming
- billing/webhooks
- admin status/error endpoints

## Scope
This playbook is for staged migration and validation, not one-shot dependency bumping.

## Baseline (must be green before upgrade)
1. `npm run type-check`
2. `npm run lint`
3. `npm run test:run`
4. `npm run build`
5. `npm run smoke -- --base-url http://localhost:3099 --start-server`
6. `npm run verify:prod -- --base-url https://multi-llm-chat-assistant.vercel.app --require-stripe --check-webhook`

## Readiness scan
Run:

```bash
npm run upgrade:next:prep
```

Interpretation:
- Any `BLOCK` must be fixed before dependency upgrade.
- `WARN` items are acceptable only with explicit test coverage added in the same branch.

## Phase plan

### Phase 1: Dependency preparation
1. Create a dedicated migration branch.
2. Upgrade in lockstep:
   - `next`
   - `eslint-config-next`
   - `react`, `react-dom` (if required by target Next)
   - `@types/react`, `@types/react-dom`
3. Reinstall and refresh lockfile.

### Phase 2: Compile/runtime fixes
1. Resolve TypeScript and ESLint breakages.
2. Verify route handlers and middleware still compile and behave correctly.
3. Validate dynamic rendering routes (auth pages, admin pages, and pages using `headers()`/`cookies()`).

### Phase 3: Contract validation
Focus tests on high-risk contracts:
1. `middleware.ts` mandatory-auth public exemptions:
   - `/api/health`
   - `/api/webhooks/stripe`
2. Stripe upsert behavior:
   - `lib/stripe.ts`
   - `app/api/webhooks/stripe/route.ts`
3. LLM parity:
   - `/api/llm/chat`
   - `/api/llm/stream`

### Phase 4: Production verification
After deploy to preview/prod:
1. `npm run verify:prod -- --base-url <deployment> --require-stripe --check-webhook`
2. Confirm `/api/health` is healthy/degraded (never 401 under strict mode).
3. Confirm signed Stripe webhook returns `HTTP 200`.

## Rollback plan
If any P0 behavior regresses:
1. Revert migration PR to previous lockfile and dependency versions.
2. Redeploy previous stable commit.
3. Keep DB migrations untouched (framework rollback only).

## P0 acceptance criteria
All must pass:
1. Quality gates: type-check/lint/tests/build.
2. Smoke tests: all pass.
3. Production verification script passes including webhook check.
4. No mandatory-auth regression for health/webhooks.
5. Billing flows continue to work for first-time users (upsert path).

## Coordination with Claude (parallel work)
Claude can own provider/stream unification while this branch owns framework migration.

Suggested split:
- This branch: dependency migration, framework compatibility, runtime verification.
- Claude branch: provider-runtime unification and stream/chat contract parity.

Merge order:
1. Merge provider unification branch first (if it changes API contracts internally).
2. Rebase Next upgrade branch on top.
3. Re-run full gate matrix before merging to main.
