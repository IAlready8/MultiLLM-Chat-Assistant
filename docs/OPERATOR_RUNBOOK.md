# Operator Runbook

This is the operator-facing runbook for startup, verification, deployment,
rollback, incident handling, and release closeout.

Related authority docs:
- `docs/SECURITY_POSTURE.md`
- `docs/THREAT_MODEL.md`
- `docs/SECRET_ROTATION.md`
- `docs/BACKUP_RESTORE_PROOF.md`

Truth boundary:
- Verified locally:
  - local bootstrap and dev startup
  - production-like verification DB flow
  - `npm run verify:prod -- --apply-migrations`
  - `bash scripts/smoke-test.sh --base-url http://localhost:3000 --start-server`
  - `/api/health` dependency truthfulness
- Verified live:
  - protected Vercel preview verification using authenticated `vercel curl`
  - prebuilt production deployment to Vercel
  - explicit promotion of the canonical production alias using `vercel promote`
  - rollback to the prior healthy deployment and forward recovery to the latest deployment
- Separately tracked:
  - Stripe checkout / portal / signed webhook validation (`handoff_work/BILLING_EVIDENCE.md`)

Current proven references:
- Preview URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- Production URL: `https://multi-llm-chat-assistant.vercel.app`
- Current healthy production deployment: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- Proven rollback target: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`

## 1. Ownership and Decision Rules

- Repo operator:
  - owns local checkout, CI interpretation, and handoff docs
- Infra owner:
  - owns Vercel project, DNS, preview/prod environment variables, and rollback
- Billing owner:
  - owns Stripe checkout / portal / webhook verification

Escalate instead of guessing when:
- `DATABASE_URL` is unavailable or points to the wrong environment
- Vercel env/config differs from `.env.example`
- Stripe should be required for a billing-ready gate but env is incomplete
- a rollback would require reversing already-applied database migrations

## 2. Minimum Runtime Contract

Production contract:
- Postgres is required.
- Strict auth is required.
- `NEXTAUTH_SECRET` or `AUTH_SECRET` is required.
- `NEXTAUTH_URL` is required.
- `API_KEY_ENCRYPTION_SEED` is required.
- Stripe is optional for technical handoff readiness.
- Python sidecar is optional.
- Redis is optional.

Required release checks on `main`:
- `Quality Checks`
- `Smoke Tests`

Health contract:
- `/api/health` must return `healthy` or `degraded`.
- `degraded` is acceptable only when the degraded dependency is optional or the
  release decision explicitly accepts the impairment.

## 3. Local Bootstrap Runbook (Verified Locally)

1. `npm ci`
2. `cp .env.example .env.local`
3. Set minimum local env:
   - `NEXTAUTH_URL=http://localhost:3000`
   - `API_KEY_ENCRYPTION_SEED=<32+ char secret>`
4. Optional strict-auth local parity:
   - `AUTH_REQUIRE_LOGIN=true`
   - `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true`
   - `NEXTAUTH_SECRET=<32+ char secret>`
5. `npm run dev`

Expected outcome:
- app loads at `http://localhost:3000`
- guest mode works when strict-auth flags are false
- strict-auth redirects unauthenticated users when strict-auth flags are true

## 4. Production-Like Local Gate (Verified Locally)

Required env example:

```bash
export NEXTAUTH_URL=http://localhost:3000
export NEXTAUTH_SECRET=verify-secret-32chars
export API_KEY_ENCRYPTION_SEED=verify-encryption-seed-32chars
export DATABASE_URL=postgresql://<user>@127.0.0.1:5432/<db_name>
```

Optional parity toggles:

```bash
export AUTH_REQUIRE_LOGIN=false
export NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false
```

Execution order:
1. `npm run verify:prod -- --apply-migrations`
2. `npm run build`
3. `bash scripts/smoke-test.sh --base-url http://localhost:3000 --start-server`

Stop on:
- missing required env
- failed DB reachability
- failed migration status after `--apply-migrations`
- smoke failure on config, goals, personas, conversations, analytics, or health

## 5. Local Release Gate (Verified Locally)

1. `npm run type-check`
2. `npm run lint`
3. `npm run test:run`
4. `npm run build`

Use section 4 as well when the change affects runtime, deployment, auth,
health, billing, migrations, or persistence behavior.

## 5A. Reliability Gate (Step 8)

Use when the change affects:
- health/status semantics
- degraded dependency handling
- cache / rate limiting / sidecar diagnostics
- operator alertability

Execution:
1. `bash scripts/reliability-check.sh --base-url http://localhost:3000 --start-server`

Source of truth:
- `docs/RELIABILITY_SLOS.md`

Pass conditions:
- degraded dependency verification slice passes
- bounded health load probe passes
- no unexpected page condition on the healthy baseline

## 6. Preview Deploy Runbook (Verified Live)

Prerequisites:
- preview env exists in Vercel for the branch/environment being tested
- preview DB target is correct
- project is linked locally with Vercel CLI access

Execution order used in live proof:
1. Pull branch-scoped preview env locally:
   - `npx vercel env pull <tmp-preview-env> --environment preview --git-branch <branch> --yes`
2. Build with preview parity:
   - `node scripts/run-with-dotenv.js <tmp-preview-env> npx vercel build`
3. Deploy the prebuilt artifact:
   - `npx vercel deploy --prebuilt --target preview --force --yes --logs`
4. Verify through authenticated preview access:
   - `USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> node scripts/run-with-dotenv.js <tmp-preview-env> bash scripts/verify-production.sh --base-url https://<preview-url>`
5. Run smoke:
   - `USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> bash scripts/smoke-test.sh --base-url https://<preview-url>`
6. If billing is intentionally enabled on preview:
   - `USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> node scripts/run-with-dotenv.js <tmp-preview-env> bash scripts/verify-production.sh --base-url https://<preview-url> --require-stripe --check-webhook`

Live proof captured:
- preview deployment: `dpl_7rCmEBpM3mwNNMcvTkoHCoJQ2vhA`
- verified URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- verify result: passed (`status=healthy`, database `connected`)
- smoke result: `19` passed, `0` failed, `13` skipped

## 7. Production Deploy Runbook (Verified Live)

Important rule:
- a successful production deploy did not move the canonical alias automatically
- explicit promotion was required using:
  - `npx vercel promote <deployment-id> --yes -S itsokialready8`

Execution order used in live proof:
1. Pull production env locally:
   - `npx vercel env pull <tmp-prod-env> --environment production --yes -S itsokialready8`
2. Build with production parity:
   - `node scripts/run-with-dotenv.js <tmp-prod-env> npx vercel build --prod`
3. Deploy the prebuilt artifact:
   - `npx vercel deploy --prebuilt --prod --force --yes --logs`
4. Promote the deployment to the canonical alias:
   - `npx vercel promote <deployment-id> --yes -S itsokialready8`
5. Verify on the canonical production URL:
   - `node scripts/run-with-dotenv.js <tmp-prod-env> bash scripts/verify-production.sh --base-url https://multi-llm-chat-assistant.vercel.app`
6. Run smoke:
   - `bash scripts/smoke-test.sh --base-url https://multi-llm-chat-assistant.vercel.app`
7. If billing-ready proof is in scope:
   - `node scripts/run-with-dotenv.js <tmp-prod-env> bash scripts/verify-production.sh --base-url https://multi-llm-chat-assistant.vercel.app --require-stripe --check-webhook`

Live proof captured:
- production deployment: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- canonical URL: `https://multi-llm-chat-assistant.vercel.app`
- verify result: passed (`status=healthy`, database `connected`)
- smoke result: `19` passed, `0` failed, `13` skipped

## 8. Rollback Runbook (Verified Live)

Rules:
- prefer application rollback before database rollback
- do not guess on destructive DB rollback
- treat DB rollback as a separate operation if migrations are already applied

Application rollback flow proven live:
1. Pull the same production env file used for production verification:
   - `npx vercel env pull <tmp-prod-env> --environment production --yes -S itsokialready8`
2. Identify the last known healthy deployment.
3. Promote that deployment to the canonical alias:
   - `npx vercel promote <prior-deployment-id> --yes -S itsokialready8`
4. Re-run:
   - `node scripts/run-with-dotenv.js <tmp-prod-env> bash scripts/verify-production.sh --base-url https://multi-llm-chat-assistant.vercel.app`
   - `bash scripts/smoke-test.sh --base-url https://multi-llm-chat-assistant.vercel.app`
5. Confirm `/api/health` and core routes recover.
6. Restore the latest intended release:
   - `npx vercel promote <current-deployment-id> --yes -S itsokialready8`
7. Re-run verify and smoke again:
   - `node scripts/run-with-dotenv.js <tmp-prod-env> bash scripts/verify-production.sh --base-url https://multi-llm-chat-assistant.vercel.app`
   - `bash scripts/smoke-test.sh --base-url https://multi-llm-chat-assistant.vercel.app`

Live proof captured:
- rollback target: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- restore target: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- verify after rollback: passed
- smoke after rollback: `19` passed, `0` failed, `13` skipped
- verify after restore: passed
- smoke after restore: `19` passed, `0` failed, `13` skipped

## 9. Incident Triage

First checks:
1. `GET /api/health`
2. review latest required GitHub checks:
   - `Quality Checks`
   - `Smoke Tests`
3. run:
   - `npm run verify:prod -- --base-url https://<affected-domain>`

Triage map:
- Health shows database degraded:
  - verify `DATABASE_URL`
  - verify DB reachability
  - run `npx prisma migrate status`
- Health shows sidecar degraded:
  - verify `PYTHON_CORE_URL`
  - confirm sidecar `/api/v1/health`
  - core app remains operable because sidecar is optional
- Auth failures or redirect loops:
  - verify `NEXTAUTH_URL`
  - verify `NEXTAUTH_SECRET` or `AUTH_SECRET`
  - verify strict-auth flags match intended environment
- Billing routes return unavailable:
  - verify `STRIPE_SECRET_KEY`
  - verify `STRIPE_PRO_PRICE_ID`
  - verify `STRIPE_WEBHOOK_SECRET`
- Smoke fails on conversations/goals/personas/config:
  - treat as release-blocking for preview/prod promotion
  - check DB availability and recent route/service changes

## 9A. Security Posture Checks (Step 9)

Use when the change affects:
- auth or session behavior
- admin access control
- runtime secrets
- Stripe webhook verification
- security-sensitive operator procedures

Primary references:
- `docs/SECURITY_POSTURE.md`
- `docs/THREAT_MODEL.md`
- `docs/SECRET_ROTATION.md`
- `docs/BACKUP_RESTORE_PROOF.md`

Minimum review set:
1. `npm run test:run -- test/api-auth.test.ts test/auth-session-reader.test.ts test/middleware-auth-routing.test.ts test/api-admin-status-route.test.ts test/api-subscriptions-routes.test.ts test/api-stripe-webhook-route.test.ts test/runtime-secrets.test.ts test/logging-safety.test.ts`
2. `npm run type-check`
3. targeted lint on touched auth/security files

Extra rule:
- database backup/restore proof is now recorded in
  `docs/BACKUP_RESTORE_PROOF.md`

## 9B. Database Backup/Restore Proof

Use when Step 9 backup/restore evidence must be reproduced locally.

Reference:
- `docs/BACKUP_RESTORE_PROOF.md`

Verified local pattern:
1. dump the source verification database with `pg_dump`
2. create a scratch database with `createdb`
3. restore the artifact with `pg_restore`
4. run `DATABASE_URL=<scratch-db-url> npx prisma migrate status`
5. run `DATABASE_URL=<scratch-db-url> bash scripts/verify-production.sh --apply-migrations`
6. run `DATABASE_URL=<scratch-db-url> bash scripts/smoke-test.sh --base-url http://127.0.0.1:3000 --start-server`

## 10. Recovery Guidance

1. Fix missing or incorrect environment variables and redeploy.
2. Re-run `verify:prod` to confirm env and health recovery.
3. If release-blocking core flows still fail, rollback the application version.
4. If the issue is isolated to optional Stripe or optional sidecar:
   - decide whether to ship degraded
   - record the accepted risk in the release-status artifacts
5. If data integrity is in question:
   - stop promotion
   - preserve logs and deployment ids
   - involve the infra owner before any destructive DB action

## 11. Related Evidence

See:
- `handoff_work/HANDOFF_INDEX.md`
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
- `handoff_work/RELEASE_MANIFEST.md`
- `handoff_work/BILLING_EVIDENCE.md`
- `handoff_work/RELEASE_STATUS.md`
- `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
