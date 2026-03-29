# Deployment Guide

This is the platform-agnostic deployment reference for the current release baseline.

## 1. Core Release Contract
- production requires Postgres
- production requires strict auth
- production requires `NEXTAUTH_URL`
- production requires `NEXTAUTH_SECRET` or `AUTH_SECRET`
- production requires `API_KEY_ENCRYPTION_SEED`
- production requires `REDIS_URL`
- billing is optional for technical handoff readiness
- Python sidecar is optional

## 2. Pre-Deploy Checklist
- `npm ci`
- `npm run type-check`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run verify:prod`
- Optional when DB schema changes are in scope:
  - `npm run verify:prod -- --apply-migrations`

## 3. Required Environment Families
At minimum, configure:
- auth/session envs
- database envs
- encryption/secret-management envs
- provider API key envs as needed for enabled providers

Optional families:
- Stripe billing envs
- sidecar envs
- deployment-platform env helpers

Reference:
- `.env.example`
- `handoff_work/ENV_INVENTORY.md`

## 4. Build and Start (Node)
```bash
npm ci
npm run build
npm run start
```

## 5. Vercel-Specific Flow
Use `VERCEL_DEPLOYMENT.md` for the proven Vercel commands.

Operationally important rule:
- production deploy did not implicitly move the canonical alias in the proven run
- explicit `vercel promote ... -S itsokialready8` was required

## 6. Post-Deploy Validation
Run:

```bash
npm run verify:prod -- --base-url https://<your-domain>
bash scripts/smoke-test.sh --base-url https://<your-domain>
```

If billing is enabled and part of the release gate:

```bash
npm run verify:prod -- --base-url https://<your-domain> --require-stripe --check-webhook
bash scripts/smoke-test.sh --base-url https://<your-domain>
```

`verify:prod` validates:
- required runtime envs
- Prisma migration status, with optional deploy
- `/api/health` status
- optional Stripe configuration and signed webhook path when required
- optional sidecar requirement when requested

## 7. Rollback Principle
- prefer application rollback before database rollback
- use the last known healthy deployment as the rollback target
- re-run verify and smoke after rollback
- re-run verify and smoke again after restoring the intended release

## 8. Supported Scope Summary
Core:
- home, auth, chat/stream/conversations, provider settings/config, goals, personas, analytics, health

Optional:
- billing + webhook flow
- Python orchestration bridge
- API test page

Experimental:
- comparison
- pipeline
- AI roundtable
- admin pages/routes

Removed from supported production scope:
- `/api/teams`

## 9. Related Docs
- `docs/OPERATOR_RUNBOOK.md`
- `VERCEL_DEPLOYMENT.md`
- `handoff_work/HANDOFF_INDEX.md`
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
- `handoff_work/RELEASE_STATUS.md`
