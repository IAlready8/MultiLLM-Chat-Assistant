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
- `NEXTAUTH_SECRET` (required in strict auth mode and recommended for all environments)
- `API_KEY_ENCRYPTION_SEED`

Common optional:
- `AUTH_REQUIRE_LOGIN`
- `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- `DEMO_ACCOUNT_*`
- `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`
- `GUEST_USER_*`
- `PYTHON_CORE_URL` (if using Python orchestration service)
- `DATABASE_URL` (if you enable real DB-backed behavior)

Use `.env.example` as the source of truth for supported variables.

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
- required env vars (`NEXTAUTH_*`, `API_KEY_ENCRYPTION_SEED`, `DATABASE_URL`)
- Prisma migration status/deploy
- health endpoint status
- Stripe key + price configuration
- webhook endpoint behavior

## Deploy via Vercel CLI
```bash
vercel login
vercel link
vercel --prod
```

## Notes on Current Runtime Behavior
- This repository currently includes Prisma-stubbed data access with service-level in-memory fallbacks.
- If you deploy exactly as-is, key/conversation fallback data is not durable across process restarts.
- For durable storage, configure DB-backed data access and `DATABASE_URL`.

## Troubleshooting
### Build fails with auth/env errors
- Ensure `NEXTAUTH_URL` is set.
- Ensure `NEXTAUTH_SECRET` is set, especially when strict auth is enabled.
- Ensure `API_KEY_ENCRYPTION_SEED` is set.

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
- `README.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `ARCHITECTURE.md`
- `PYTHON_INTEGRATION.md`
