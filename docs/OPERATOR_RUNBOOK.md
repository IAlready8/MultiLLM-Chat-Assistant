# Operator Runbook

This is the operator-facing runbook for startup, verification, deployment,
rollback, and incident handling.

Truth boundary:
- Verified locally:
  - local bootstrap and dev startup
  - production-like verification DB flow
  - `npm run verify:prod -- --apply-migrations`
  - `bash scripts/smoke-test.sh --base-url http://localhost:3000 --start-server`
  - `/api/health` dependency truthfulness
- Prepared but not yet live-proven:
  - preview deploy execution (`17.2`)
  - production deploy execution (`17.3`)
  - rollback execution (`17.4`)

Do not upgrade a prepared procedure to "verified" until the matching checklist
gate is closed with evidence.

## 1. Ownership and Decision Rules

- Repo operator:
  - owns local checkout, CI interpretation, and handoff docs
- Infra owner:
  - owns Vercel project, DNS, preview/prod environment variables, and rollback
- Billing owner:
  - owns live Stripe checkout / portal / webhook verification

Escalate instead of guessing when:
- `DATABASE_URL` is unavailable or points to the wrong environment
- Vercel env/config differs from `.env.example`
- Stripe or sidecar should be required for a deploy gate but env is incomplete
- a rollback would require reversing already-applied database migrations

## 2. Minimum Runtime Contract

Production contract:
- Postgres is required.
- Strict auth is required.
- `NEXTAUTH_SECRET` or `AUTH_SECRET` is required.
- `NEXTAUTH_URL` is required.
- `API_KEY_ENCRYPTION_SEED` is required.
- Stripe is optional.
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

Use this when setting up a fresh local workspace.

1. Install dependencies:
   - `npm ci`
2. Create local env file:
   - `cp .env.example .env.local`
3. Set minimum local env:
   - `NEXTAUTH_URL=http://localhost:3000`
   - `API_KEY_ENCRYPTION_SEED=<32+ char secret>`
4. Optional strict-auth local parity:
   - `AUTH_REQUIRE_LOGIN=true`
   - `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true`
   - `NEXTAUTH_SECRET=<32+ char secret>`
5. Start dev server:
   - `npm run dev`

Expected outcome:
- app loads at `http://localhost:3000`
- guest mode works when strict-auth flags are false
- strict-auth redirects unauthenticated users when strict-auth flags are true

## 4. Production-Like Local Gate Runbook (Verified Locally)

Use this before attempting preview or production deployment.

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

1. Verify runtime contract and DB wiring:
   - `npm run verify:prod -- --apply-migrations`
2. Build production artifact:
   - `npm run build`
3. Run prod-like smoke against a started server:
   - `bash scripts/smoke-test.sh --base-url http://localhost:3000 --start-server`

Expected outcome:
- `verify:prod` passes env validation, DB reachability, migration status, and
  health validation
- smoke exits with zero failures
- `/api/health` reports real dependency state instead of placeholders

Stop conditions:
- missing required env
- failed DB reachability
- failed migration status after `--apply-migrations`
- smoke failure on goals, personas, conversations, config, analytics, or health

## 5. Local Release Gate Runbook (Verified Locally)

Use this before opening or merging a release PR.

1. `npm run type-check`
2. `npm run lint`
3. `npm run test:run`
4. `npm run build`

Use the production-like gate in section 4 when the change affects runtime,
deployment, auth, health, billing, migrations, or persistence behavior.

## 6. Preview Deploy Runbook (Prepared, Pending Live Proof In `17.2`)

Prerequisites:
- preview environment variables exist in Vercel
- preview database target is correct
- project is linked to this repository

Preferred path:
1. Push the branch to GitHub.
2. Trigger preview deployment through Vercel Git integration, or:
   - `vercel deploy -y`
3. Capture the preview URL.
4. Run:
   - `npm run verify:prod -- --base-url https://<preview-url>`
5. If Stripe is intentionally enabled on preview:
   - `npm run verify:prod -- --base-url https://<preview-url> --require-stripe --check-webhook`
6. Run smoke:
   - `bash scripts/smoke-test.sh --base-url https://<preview-url>`

Required evidence to close `17.2`:
- preview URL
- passing `verify:prod` output
- passing smoke output
- `/api/health` result captured from preview

## 7. Production Deploy Runbook (Prepared, Pending Live Proof In `17.3`)

Prerequisites:
- `main` is protected and only mergeable with green required checks
- production environment variables are present
- database target is confirmed
- on-call owner is available for post-deploy verification

Preferred path:
1. Merge the approved PR to `main`.
2. Confirm Vercel production deployment starts from `main`.
3. Capture the production URL / deployment id.
4. Run:
   - `npm run verify:prod -- --base-url https://<production-domain>`
5. If Stripe is in scope for this environment:
   - `npm run verify:prod -- --base-url https://<production-domain> --require-stripe --check-webhook`
6. Run smoke:
   - `bash scripts/smoke-test.sh --base-url https://<production-domain>`
7. Review `/api/health` and required user-critical surfaces:
   - home
   - auth
   - settings/provider config
   - multi-chat
   - goals
   - personas
   - analytics

Required evidence to close `17.3`:
- production deployment identifier
- passing `verify:prod` output
- passing smoke output
- `/api/health` payload/status capture

## 8. Rollback Runbook (Prepared, Pending Live Proof In `17.4`)

Use this for application regressions after deploy.

Rules:
- prefer application rollback before database rollback
- do not guess on destructive DB rollback
- if migrations were already applied, treat DB rollback as a separate change

Application rollback flow:
1. Identify the last known healthy git SHA / Vercel deployment.
2. Redeploy that prior application version.
3. Re-run:
   - `npm run verify:prod -- --base-url https://<target-domain>`
   - `bash scripts/smoke-test.sh --base-url https://<target-domain>`
4. Confirm `/api/health` and core routes recover.
5. Record the incident window, bad SHA, restored SHA, and any user-visible impact.

Required evidence to close `17.4`:
- bad deployment id / SHA
- restored deployment id / SHA
- passing post-rollback verify output
- passing post-rollback smoke output

## 9. Incident Triage Runbook

Start here when the app is unhealthy, deploy verification fails, or user-facing
features regress.

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
  - core app can still operate without sidecar because it is optional
- Auth failures or redirect loops:
  - verify `NEXTAUTH_URL`
  - verify `NEXTAUTH_SECRET` or `AUTH_SECRET`
  - verify strict-auth flags match intended environment
- Billing routes return unavailable:
  - verify `STRIPE_SECRET_KEY`
  - verify `STRIPE_PRO_PRICE_ID`
  - verify `STRIPE_WEBHOOK_SECRET` when webhook checks are required
- Smoke fails on conversations/goals/personas/config:
  - treat as release-blocking for preview/prod promotion
  - check DB availability and recent route/service changes

## 10. Recovery Guidance

Recover by lowest-risk action first:

1. Fix missing or incorrect environment variables and redeploy.
2. Re-run `verify:prod` to confirm env and health recovery.
3. If release-blocking core flows still fail, rollback the application version.
4. If the issue is isolated to optional Stripe or optional sidecar:
   - decide whether to ship degraded
   - document the accepted risk in the status log
5. If data integrity is in question:
   - stop promotion
   - preserve logs and deployment ids
   - involve the infra owner before any destructive DB action

## 11. Evidence Already Captured

Verified in this repository before this runbook was written:
- `npm run verify:prod -- --apply-migrations` against local Postgres verification DB
- guest-mode smoke with supported lifecycle probes
- production-mode smoke with started production server
- `/api/health` route truthfulness tests
- sanitized log/error behavior tests

See also:
- `handoff_work/currentstatus.md`
- `handoff_work/CLOSURE_MASTER_CHECKLIST.md`
- `VERCEL_DEPLOYMENT.md`
- `docs/DEPLOYMENT_GUIDE.md`
