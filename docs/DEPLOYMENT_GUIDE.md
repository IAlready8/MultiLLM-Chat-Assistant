# Deployment Guide

This guide is the platform-agnostic deployment reference for the MultiLLM Chat Assistant.

## 1. Pre-Deploy Checklist
- `npm ci`
- `npm run type-check`
- `npm run lint`
- `npm run build`
- Optional: `npm run test:run`

## 2. Required Environment Variables
At minimum, configure:
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`
- `DATABASE_URL` for production

Common toggles and optional vars:
- `AUTH_REQUIRE_LOGIN`
- `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- `DEMO_ACCOUNT_*`
- `NEXT_PUBLIC_DEMO_ACCOUNT_*`
- `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`
- `GUEST_USER_*`
- `NEXT_PUBLIC_GUEST_USER_ID`
- `PYTHON_CORE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `LLM_FETCH_TIMEOUT_MS`
- `LLM_FETCH_RETRIES`
- `NEXT_PUBLIC_SECURE_STORAGE_KEY`

Reference: `.env.example`

## 3. Build and Start (Node)
```bash
npm ci
npm run build
npm run start
```

## 4. Container/Platform Notes
- Ensure the runtime exposes the same env vars used at build/start.
- Preview and production environments are separate in Vercel; do not assume preview has production-only vars.
- If orchestration is enabled, `PYTHON_CORE_URL` must be reachable from the app runtime.
- If database-backed persistence is enabled, provide valid `DATABASE_URL` and schema/migrations.
- If billing checks are required, provide `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` in that environment.

## 5. Vercel
Use `VERCEL_DEPLOYMENT.md` for Vercel-specific instructions.

## 6. PM2 (optional local/prod process manager)
PM2 config exists in `ecosystem.config.js`.

Example:
```bash
pm2 start ecosystem.config.js
pm2 status
```

## 7. Post-Deploy Validation
Verify these endpoints/pages:
- `/` renders
- `/api/auth/session` returns JSON
- `/api/config` returns JSON
- `/settings` loads and can save provider keys
- `/api/llm/chat` handles configured provider requests

## 8. Production Lock-In Checklist
Run these checks to confirm production is wired end-to-end:

```bash
npm run verify:prod -- --base-url https://<your-domain>
```

With full billing + webhook checks:

```bash
npm run verify:prod -- --base-url https://<your-domain> --require-stripe --check-webhook
```

If migrations are pending:

```bash
npm run verify:prod -- --apply-migrations --require-stripe
```

`verify:prod` validates:
- required runtime env vars
- Prisma migration status (and optional deploy)
- `/api/health` status
- Stripe configuration and price ID (`--require-stripe`)
- webhook route behavior (`--check-webhook`)
  - with `--require-stripe`, webhook validation uses a signed test payload and expects HTTP 200

## 9. Known Runtime Tradeoffs
- Current repository includes in-memory fallback stores for provider config and conversations when DB delegates are unavailable.
- In-memory fallback data is process-local and non-persistent.

## 10. Related Docs
- `docs/OPERATOR_RUNBOOK.md`
- `README.md`
- `ARCHITECTURE.md`
- `PYTHON_INTEGRATION.md`
- `VERCEL_DEPLOYMENT.md`
