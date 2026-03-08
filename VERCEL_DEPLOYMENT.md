# Vercel Deployment

This guide covers the proven Vercel deployment flow for the current repository.

## Current Proven State
- Protected preview verification: proven
- Production deployment to canonical alias: proven
- Rollback and forward recovery: proven
- Billing-ready validation: tracked separately in `handoff_work/BILLING_EVIDENCE.md`

Current proven references:
- Preview deployment: `dpl_7rCmEBpM3mwNNMcvTkoHCoJQ2vhA`
- Preview URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- Production deployment: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- Rollback target: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Production URL: `https://multi-llm-chat-assistant.vercel.app`

## Prerequisites
- Vercel account with access to the linked team/project
- Vercel CLI authenticated and linked to this repository
- Node.js 20+ locally
- required environment variables configured in Vercel

## Build Configuration
Repository includes `vercel.json`:
- `buildCommand`: `npm run build`
- `installCommand`: `npm install`
- `framework`: `nextjs`

No custom Vercel build override is required.

## Required Environment Variables
Set these in Vercel Project Settings -> Environment Variables.

Required for core runtime:
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`
- `DATABASE_URL`

Common optional:
- `AUTH_REQUIRE_LOGIN`
- `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- `PYTHON_CORE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `LLM_FETCH_TIMEOUT_MS`
- `LLM_FETCH_RETRIES`
- `NEXT_PUBLIC_SECURE_STORAGE_KEY`

Use `.env.example` and `handoff_work/ENV_INVENTORY.md` as the env references.

## Preview Deploy Flow (Proven)
1. Pull branch-scoped preview env:

```bash
npx vercel env pull <tmp-preview-env> --environment preview --git-branch <branch> --yes
```

2. Build with preview parity:

```bash
node scripts/run-with-dotenv.js <tmp-preview-env> npx vercel build
```

3. Deploy the prebuilt artifact:

```bash
npx vercel deploy --prebuilt --target preview --force --yes --logs
```

4. Verify through authenticated preview access:

```bash
USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> \
node scripts/run-with-dotenv.js <tmp-preview-env> \
bash scripts/verify-production.sh --base-url https://<preview-url>
```

5. Run smoke:

```bash
USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> \
bash scripts/smoke-test.sh --base-url https://<preview-url>
```

## Production Deploy Flow (Proven)
1. Pull production env:

```bash
npx vercel env pull <tmp-prod-env> --environment production --yes -S itsokialready8
```

2. Build with production parity:

```bash
node scripts/run-with-dotenv.js <tmp-prod-env> npx vercel build --prod
```

3. Deploy the prebuilt artifact:

```bash
npx vercel deploy --prebuilt --prod --force --yes --logs
```

4. Promote the deployment to the canonical alias:

```bash
npx vercel promote <deployment-id> --yes -S itsokialready8
```

5. Verify production:

```bash
node scripts/run-with-dotenv.js <tmp-prod-env> \
bash scripts/verify-production.sh --base-url https://multi-llm-chat-assistant.vercel.app
bash scripts/smoke-test.sh --base-url https://multi-llm-chat-assistant.vercel.app
```

Important:
- a successful deploy alone did not move the canonical production alias
- explicit `vercel promote ... -S itsokialready8` was required in the proven flow

## Billing-Enabled Validation
If billing is intentionally enabled in the environment:

```bash
node scripts/run-with-dotenv.js <tmp-prod-env> \
bash scripts/verify-production.sh --base-url https://<your-domain> --require-stripe --check-webhook
```

This validates:
- Stripe key and price configuration
- signed webhook path behavior

## Local Preview-Parity Build
To validate branch-scoped preview env without consuming a deployment:

```bash
npm run build:preview:local
npm run verify:preview:local
npm run smoke:preview:local
npm run smoke:preview:local:auth
```

## Operational Notes
- Preview and production env scopes are separate.
- Do not assume preview inherits production-only values.
- Protected preview verification requires authenticated `vercel curl` when preview auth is enabled.
- Production rollback should use deployment promotion first; do not guess on DB rollback.
- In-memory fallbacks are development-only; production runtime is DB-required and fail-closed for core persistence paths.

## Troubleshooting
### Build fails with auth/env errors
- Verify `NEXTAUTH_URL`
- Verify `NEXTAUTH_SECRET` or `AUTH_SECRET`
- Verify `API_KEY_ENCRYPTION_SEED`
- Verify `DATABASE_URL`
- Confirm the env exists in the correct Vercel scope

### Deployment errors before build starts
- Inspect with `vercel inspect <deployment-url>`
- On Hobby plans, the daily deployment API limit can fail the deploy before build start (`api-deployments-free-per-day`)

### Production URL did not move
- Run explicit promotion:
  - `npx vercel promote <deployment-id> --yes -S itsokialready8`

### Webhook returns 503
- Verify `STRIPE_SECRET_KEY`
- Verify `STRIPE_PRO_PRICE_ID`
- Verify `STRIPE_WEBHOOK_SECRET`
- Re-run billing-enabled verification

## Related
- `docs/OPERATOR_RUNBOOK.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `handoff_work/HANDOFF_INDEX.md`
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
- `handoff_work/BILLING_EVIDENCE.md`
