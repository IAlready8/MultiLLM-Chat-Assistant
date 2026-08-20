# MultiLLM Chat Assistant

[![CI](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/IAlready8/MultiLLM-Chat-Assistant)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/IAlready8/MultiLLM-Chat-Assistant/main)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/commits/main)
[![Open Issues](https://img.shields.io/github/issues/IAlready8/MultiLLM-Chat-Assistant)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/issues)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)

Multi-provider LLM workspace built for repeatable multi-model work, saved workflow history, and operator visibility across providers.

Current exact ICP and use case are locked in:
- `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`

## Highlights
- Multi-provider chat endpoints with streaming support
- Supported providers: OpenAI, Anthropic, Google AI, OpenRouter, Grok,
  Mistral, Ollama, Kimi (Moonshot AI), and the official DeepSeek V4 API
- Configurable encrypted per-user provider keys from app settings, including
  DeepSeek BYOK
- Mandatory account authentication with Google/GitHub OAuth and existing-account password login
- Optional Python orchestration sidecar (`src/core`)
- CI workflow for type-check, lint, and build

## Quickstart
Requirements:
- Node.js 22 LTS (`22.22.0`; see `.nvmrc`)
- npm 11
- Optional Python 3.10+ (only for Python sidecar / Python tests)

Setup:
1. `npm ci`
2. `cp .env.example .env.local`
3. Set minimum env for local app usage:
   - `NEXTAUTH_URL`
   - `API_KEY_ENCRYPTION_SEED`
   - `NEXTAUTH_SECRET` or `AUTH_SECRET`
   - `DATABASE_URL`
   - One OAuth pair (`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, or GitHub equivalents) when new account creation is required
4. Start dev server: `npm run dev`

Package manager:
- `package-lock.json` is the only lockfile and source of truth.
- CI and Vercel both install with `npm ci`.

## Authentication
- Every protected page and API requires a real NextAuth session in every environment.
- Google and GitHub OAuth create and sign in durable Prisma-backed accounts.
- Email/password is login-only for existing users with a stored password hash; it never creates a user implicitly.
- Server-only `AUTH_OWNER_EMAILS` and `AUTH_ADMIN_EMAILS` allowlists assign real operator roles.
- Public password registration is intentionally disabled until verified email ownership and account recovery are implemented.
- Demo users, guest identities, auth-bypass flags, and guest-to-user migration are not supported.

See `docs/AUTHENTICATION_SETUP.md` for provider registration, callback URLs, environment configuration, and rollout checks.

## Scripts
- `npm run dev`: Start Next.js dev server (webpack mode, default)
- `npm run dev:webpack`: Start dev server in webpack mode explicitly
- `npm run dev:turbopack`: Start dev server in Turbopack mode for migration validation
- `npm run build`: Create production build (webpack mode, default)
- `npm run build:webpack`: Build explicitly in webpack mode
- `npm run build:turbopack`: Build in Turbopack mode for migration validation
- `npm run start`: Start production server
- `npm run lint`: ESLint (`--max-warnings=0`)
- `npm run type-check`: TypeScript checks
- `npm run test`: Vitest (watch)
- `npm run test:run`: Vitest one-shot
- `npm run coverage`: Vitest coverage with the enforced baseline threshold
- `npm run test:coverage`: Vitest with coverage
- `npm run smoke`: End-to-end smoke checks (pages + key APIs)
- `npm run verify:prod`: Production readiness checks (env, DB, health, optional Stripe/webhook)
- `npm run setup:env`: Scaffold `.env.local` from `.env.example`
- `npm run env:validate`: Validate required env keys for local or production profiles
- `npm run preflight`: Run env validation + type-check + lint before release steps
- `npm run validate:all`: Full local gate (`type-check`, `lint`, `test:run`, `build`)
- `npm run ci:local`: CI-parity local check sequence
- `npm run build:vercel`: Wrapper for `vercel build` with optional dotenv injection
- `npm run clean` / `clean:deep` / `clean:all`: Clean caches and build artifacts
- `npm run protect:main`: Enforce `main` branch protection with required CI checks
- `npm run upgrade:next:prep`: Next.js major-upgrade readiness scan + preflight gate checks

## CI
GitHub Actions workflow: `.github/workflows/ci.yml`
- Installs dependencies
- Generates Prisma client
- Runs `npm run type-check`
- Runs `npm run lint`
- Runs `npm run test:run`
- Runs `npm run coverage` as a blocking check
- Runs `npm run build`
- Runs smoke tests against a PostgreSQL-backed app instance
- Blocks high/critical production advisories and critical full-tree advisories

## Branch Protection (Mandatory CI)
To make CI checks mandatory on `main`, run:

```bash
gh auth login -h github.com
npm run protect:main
```

If `gh` is not authenticated, you can use a token:

```bash
export GITHUB_TOKEN=<token-with-repo-admin-rights>
npm run protect:main -- IAlready8/MultiLLM-Chat-Assistant
```

This enforces required status checks:
- `Quality Checks`
- `Smoke Tests`
- `Coverage`
- `Security Audit`

Without passing checks, merges to `main` are blocked.

## Production Verification
Before or immediately after a production deployment:

```bash
npm run verify:prod -- --base-url https://<your-domain> --check-webhook
```

`--check-webhook` requires `--base-url`.

To apply pending DB migrations and enforce optional integrations:

```bash
npm run verify:prod -- --apply-migrations --require-stripe --require-sidecar
```

For branch-aware preview parity without creating a Vercel deployment:

```bash
npm run build:preview:local
npm run verify:preview:local
npm run smoke:preview:local
npm run smoke:preview:local:auth
```

The authenticated smoke command requires either `SMOKE_SESSION_COOKIE` or the
`SMOKE_AUTH_EMAIL` and `SMOKE_AUTH_PASSWORD` of an existing password account.

## Architecture Snapshot
- App/UI: Next.js App Router (`app/*`) + reusable components (`components/*`)
- API layer: route handlers in `app/api/*`
- Auth: NextAuth with credential + OAuth providers (`lib/auth.ts`)
- Data access:
  - Production requires `DATABASE_URL` and uses Prisma runtime client (`lib/prisma.ts`)
  - In-memory fallback paths are development-only; production fallback is fail-closed
- Optional sidecar: FastAPI orchestration service in `src/core/*`

See full details in `ARCHITECTURE.md` and `PYTHON_INTEGRATION.md`.

## Environment
Primary reference: `.env.example`

Key groups:
- Auth/session: `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (or `AUTH_SECRET`), `AUTH_OWNER_EMAILS`, optional `AUTH_ADMIN_EMAILS`
- OAuth account creation: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Provider key encryption: `API_KEY_ENCRYPTION_SEED`
- Optional Python-sidecar Kimi key: `MOONSHOT_API_KEY`
- Database: `DATABASE_URL` (required in production)
- Optional billing: `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- Optional sidecar routing: `PYTHON_CORE_URL`
- Optional app metadata/network tuning: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `LLM_FETCH_TIMEOUT_MS`, `LLM_FETCH_RETRIES`
- Optional client secure-storage override: `NEXT_PUBLIC_SECURE_STORAGE_KEY`

DeepSeek uses the official `https://api.deepseek.com` API with the
`deepseek-v4-flash` (default/economical) and `deepseek-v4-pro` models. Each user
must save their own DeepSeek API key in Settings and maintain sufficient credit
with DeepSeek. The existing provider-key service encrypts that key server-side;
provider configuration responses never return it. Usage is billed directly by
DeepSeek and the app reports its cost as `Provider-billed` rather than `$0` or
an inaccurate estimate.

DeepSeek chat and stream requests accept `reasoning_effort` values `off`,
`low`, `high`, or `max`. The app explicitly sends thinking disabled for `off`,
thinking enabled with the matching effort for the other values, and deliberately
uses enabled/high when the value is omitted. Rate-limit responses preserve the
API's `Retry-After` delay for clients. DeepSeek requests in orchestration stay
in the authenticated Next.js runtime so the encrypted per-user key is never
forwarded to the optional Python sidecar.

## Deployment
- Operator runbook: `docs/OPERATOR_RUNBOOK.md`
- Vercel setup: `VERCEL_DEPLOYMENT.md`
- General deployment notes: `docs/DEPLOYMENT_GUIDE.md`
- Release handoff bundle: `handoff_work/HANDOFF_INDEX.md`

### Deploy Technique Used (Current Workflow)
This is the proven command model used for preview and production verification:

1. Pull the environment for the target scope:
   - Preview branch parity:
     - `npx vercel env pull <tmp-preview-env> --environment preview --git-branch <branch> --yes`
   - Production parity:
     - `npx vercel env pull <tmp-prod-env> --environment production --yes -S itsokialready8`
2. Build the prebuilt artifact locally:
   - Preview:
     - `node scripts/run-with-dotenv.js <tmp-preview-env> npx vercel build`
   - Production:
     - `node scripts/run-with-dotenv.js <tmp-prod-env> npx vercel build --prod`
3. Deploy the prebuilt artifact:
   - Preview:
     - `npx vercel deploy --prebuilt --target preview --force --yes --logs`
   - Production:
     - `npx vercel deploy --prebuilt --prod --force --yes --logs`
4. Important production rule:
   - A successful production deploy did not automatically move the canonical alias.
   - The proven flow required:
     - `npx vercel promote <deployment-id> --yes -S itsokialready8`
5. Verify and smoke the deployed target:
   - Preview:
     - `USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> node scripts/run-with-dotenv.js <tmp-preview-env> bash scripts/verify-production.sh --base-url https://<preview-url>`
     - `USE_VERCEL_CURL=true VERCEL_CURL_DEPLOYMENT=https://<preview-url> bash scripts/smoke-test.sh --base-url https://<preview-url>`
   - Production:
     - `node scripts/run-with-dotenv.js <tmp-prod-env> bash scripts/verify-production.sh --base-url https://multi-llm-chat-assistant.vercel.app`
     - `bash scripts/smoke-test.sh --base-url https://multi-llm-chat-assistant.vercel.app`

### Make Every Push To `main` Auto-Deploy
Configure once in Vercel Project Settings:

1. Connect this GitHub repository to the Vercel project.
2. Set `Production Branch` to `main`.
3. Add required environment variables in Vercel for both `Production` and `Preview`:
   - `NEXTAUTH_SECRET` or `AUTH_SECRET`
   - `NEXTAUTH_URL`
   - `API_KEY_ENCRYPTION_SEED`
   - `DATABASE_URL`
   - Add Stripe vars to any environment where billing verification is expected:
     - `STRIPE_SECRET_KEY`
     - `STRIPE_PRO_PRICE_ID`
     - `STRIPE_WEBHOOK_SECRET`
   - Add `PYTHON_CORE_URL` if the sidecar is part of that environment
   - CLI shortcut:
     - `vercel env add NEXTAUTH_SECRET production && vercel env add NEXTAUTH_SECRET preview`
     - `vercel env add NEXTAUTH_URL production && vercel env add NEXTAUTH_URL preview`
     - `vercel env add API_KEY_ENCRYPTION_SEED production && vercel env add API_KEY_ENCRYPTION_SEED preview`
4. Keep preview and production scopes aligned.
   - Vercel preview envs can be branch-scoped; verify them with `vercel env ls preview`.
   - Do not assume preview inherits production-only vars such as Stripe keys.
5. Ensure your Git author identity is valid and has access to the Vercel team/project (email must match an authorized member).

After this setup, every `git push origin main` should trigger a production deployment automatically via Vercel Git integration.

Operational note:
- auto-deploy initiation and canonical alias promotion are not the same thing
- in the proven release flow, explicit `vercel promote ... -S itsokialready8` was still required to move the production alias deterministically

## Additional Docs
- `docs/OPERATOR_RUNBOOK.md`: startup, verification, deploy, rollback, incident runbooks
- `DOCS_SOURCE_OF_TRUTH.md`: authoritative-vs-historical doc map
- `DOCUMENTATION.md`: API/services/components reference
- `DESIGN_SYSTEM.md`: design tokens and UI conventions
- `ROADMAP.md`: branch-control pointer for the active roadmap branch and authoritative planning surfaces
- `STATUS_UPDATE.md`: historical repository snapshot only
- `SECURITY_AUDIT_TRIAGE.md`: latest dependency-audit triage and remediation notes
- `NEXT_UPGRADE_PLAYBOOK.md`: staged Next.js major-upgrade execution + rollback plan

## License
MIT (`LICENSE`)
