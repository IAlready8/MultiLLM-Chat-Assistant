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
- `NEXTAUTH_SECRET` (required for strict auth mode)
- `API_KEY_ENCRYPTION_SEED`

Common toggles and optional vars:
- `AUTH_REQUIRE_LOGIN`
- `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- `DEMO_ACCOUNT_*`
- `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`
- `GUEST_USER_*`
- `PYTHON_CORE_URL`
- `DATABASE_URL`

Reference: `.env.example`

## 3. Build and Start (Node)
```bash
npm ci
npm run build
npm run start
```

## 4. Container/Platform Notes
- Ensure the runtime exposes the same env vars used at build/start.
- If orchestration is enabled, `PYTHON_CORE_URL` must be reachable from the app runtime.
- If database-backed persistence is enabled, provide valid `DATABASE_URL` and schema/migrations.

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

## 9. Known Runtime Tradeoffs
- Current repository includes in-memory fallback stores for provider config and conversations when DB delegates are unavailable.
- In-memory fallback data is process-local and non-persistent.

## 10. Related Docs
- `README.md`
- `ARCHITECTURE.md`
- `PYTHON_INTEGRATION.md`
- `VERCEL_DEPLOYMENT.md`
