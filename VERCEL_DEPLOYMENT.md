# Vercel Deployment

This guide covers deploying the Next.js app to Vercel with the current repository configuration.

## Prerequisites
- Vercel account
- Project connected to this GitHub repository, or Vercel CLI (`npm i -g vercel`)
- Node.js 20+ locally (for parity with CI/dev)

## Build Configuration
Repository already includes `vercel.json`:
- `buildCommand`: `npm run build`
- `installCommand`: `npm install`
- `framework`: `nextjs`

No extra Vercel build command override is required.

## Required Environment Variables
Set these in Vercel Project Settings -> Environment Variables.

Required:
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`
- `DATABASE_URL`

Common optional:
- `AUTH_REQUIRE_LOGIN`
- `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- `DEMO_ACCOUNT_*`
- `NEXT_PUBLIC_DEMO_ACCOUNT_*`
- `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`
- `GUEST_USER_*`
- `NEXT_PUBLIC_GUEST_USER_ID`
- `PYTHON_CORE_URL` (if using Python orchestration service)
- `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (if billing is enabled)
- `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL` (for attribution/branding)
- `LLM_FETCH_TIMEOUT_MS`, `LLM_FETCH_RETRIES` (for outbound request tuning)
- `NEXT_PUBLIC_SECURE_STORAGE_KEY` (test/dev override)

Use `.env.example` as the source of truth for supported variables.

CLI alternative (sets permanent project env vars):

```bash
vercel env add NEXTAUTH_SECRET production
vercel env add NEXTAUTH_SECRET preview
vercel env add NEXTAUTH_URL production
vercel env add NEXTAUTH_URL preview
vercel env add API_KEY_ENCRYPTION_SEED production
vercel env add API_KEY_ENCRYPTION_SEED preview
vercel env add DATABASE_URL production
vercel env add DATABASE_URL preview
```

Generate `NEXTAUTH_SECRET` with:

```bash
openssl rand -base64 32
```

## Deploy via GitHub Integration
1. Import the repository in Vercel.
2. Set environment variables.
3. Trigger a deployment from `main`.
4. Confirm:
   - Build succeeds
   - `/api/auth/session` responds
   - `/api/config` responds

## Production DB + Stripe Verification
After a successful deploy, validate runtime wiring:

```bash
npm run verify:prod -- --base-url https://<your-domain> --require-stripe --check-webhook
```

If your deployment introduced new migrations:

```bash
npm run verify:prod -- --apply-migrations --require-stripe
```

This validates:
- required env vars (`NEXTAUTH_*` or `AUTH_SECRET`, `API_KEY_ENCRYPTION_SEED`, `DATABASE_URL`)
- Prisma migration status/deploy
- health endpoint status
- Stripe key + price configuration
- webhook endpoint behavior (signed verification when `--require-stripe` is used)

## Deploy via Vercel CLI
```bash
vercel login
vercel link
vercel --prod
```

## Local Preview-Parity Build
To validate the branch-scoped preview environment without consuming a deployment:

```bash
npm run build:preview:local
npm run verify:preview:local
npm run smoke:preview:local
npm run smoke:preview:local:auth
```

This pulls the current branch's preview env vars from Vercel and runs a local production build with them.

## Notes on Current Runtime Behavior
- This repository currently includes Prisma-stubbed data access with service-level in-memory fallbacks.
- If you deploy exactly as-is, key/conversation fallback data is not durable across process restarts.
- For durable storage, configure DB-backed data access and `DATABASE_URL`.

## Troubleshooting
### Build fails with auth/env errors
- Ensure `NEXTAUTH_URL` is set.
- Ensure `NEXTAUTH_SECRET` or `AUTH_SECRET` is set.
- Ensure `API_KEY_ENCRYPTION_SEED` is set.
- Ensure `DATABASE_URL` is set.
- Run `vercel env ls preview` and confirm preview vars are available for the branch/environment you are deploying.

### Deployment errors before build starts
- If Vercel shows `Error` with a `0ms` build, inspect with `vercel deploy --debug` or `vercel inspect <deployment-url>`.
- A common cause on Hobby plans is hitting the daily deployment API limit (`api-deployments-free-per-day`), which fails before a real build starts.

### Orchestration endpoint returns 503
- Set `PYTHON_CORE_URL` to a reachable FastAPI service.
- Confirm sidecar health and network accessibility from Vercel runtime.

### API config routes return empty/no providers
- Expected when no provider keys have been saved for the current user/guest identity.

### Webhook returns 503
- `STRIPE_SECRET_KEY` is missing/invalid in Vercel env vars.
- Confirm `STRIPE_WEBHOOK_SECRET` exists for the same environment.
- Re-run:
  - `npm run verify:prod -- --base-url https://<your-domain> --require-stripe --check-webhook`

## Related
- `docs/OPERATOR_RUNBOOK.md`
- `README.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `ARCHITECTURE.md`
- `PYTHON_INTEGRATION.md`
