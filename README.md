# MultiLLM Chat Assistant

[![CI](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/IAlready8/MultiLLM-Chat-Assistant)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/IAlready8/MultiLLM-Chat-Assistant/main)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/commits/main)
[![Open Issues](https://img.shields.io/github/issues/IAlready8/MultiLLM-Chat-Assistant)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/issues)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)

Multi-LLM web app for chat, personas, analytics, comparison workflows, pipelines, and AI Roundtable.

## Highlights
- Multi-provider chat endpoints with streaming support
- Supported providers: OpenAI, Anthropic, Google AI, OpenRouter, Grok
- Configurable provider keys from app settings
- Auth modes for demo/guest and strict login
- Optional Python orchestration sidecar (`src/core`)
- CI workflow for type-check, lint, and build

## Quickstart
Requirements:
- Node.js 20+
- npm
- Optional Python 3.10+ (only for Python sidecar / Python tests)

Setup:
1. `npm ci`
2. `cp .env.example .env.local`
3. Set minimum env for local app usage:
   - `NEXTAUTH_URL`
   - `API_KEY_ENCRYPTION_SEED`
   - `AUTH_REQUIRE_LOGIN` / `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN` (optional; defaults to guest-friendly mode)
4. Start dev server: `npm run dev`

Package manager:
- Source-of-truth lockfile is `package-lock.json` (npm workflow).
- `pnpm-lock.yaml` is retained as an archival snapshot and is not used by CI.

## Auth Modes
- Production:
  - Strict auth is always enforced in production runtime.
  - `NEXTAUTH_SECRET` (or `AUTH_SECRET`) and `NEXTAUTH_URL` are required.
- Guest/demo mode (default for local dev):
  - `AUTH_REQUIRE_LOGIN=false`
  - `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false`
  - Allows using the app and saving provider keys without creating an account.
- Strict auth mode:
  - `AUTH_REQUIRE_LOGIN=true`
  - `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true`
  - Requires real session auth and explicit `NEXTAUTH_SECRET`.

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
- `npm run test:coverage`: Vitest with coverage
- `npm run smoke`: End-to-end smoke checks (pages + key APIs)
- `npm run verify:prod`: Production readiness checks (env, DB, health, optional Stripe/webhook)
- `npm run protect:main`: Enforce `main` branch protection with required CI checks
- `npm run upgrade:next:prep`: Next.js major-upgrade readiness scan + preflight gate checks

## CI
GitHub Actions workflow: `.github/workflows/ci.yml`
- Installs dependencies
- Generates Prisma client
- Runs `npm run type-check`
- Runs `npm run lint`
- Runs `npm run test:run`
- Runs `npm run build`
- Runs smoke tests against a PostgreSQL-backed app instance

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
- Auth/session: `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (or `AUTH_SECRET`), `AUTH_REQUIRE_LOGIN`, `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- Demo/guest behavior: `DEMO_ACCOUNT_*`, `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`, `GUEST_USER_*`
- Provider key encryption: `API_KEY_ENCRYPTION_SEED`
- Database: `DATABASE_URL` (required in production)
- Optional billing: `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- Optional sidecar routing: `PYTHON_CORE_URL`

## Deployment
- Operator runbook: `docs/OPERATOR_RUNBOOK.md`
- Vercel setup: `VERCEL_DEPLOYMENT.md`
- General deployment notes: `docs/DEPLOYMENT_GUIDE.md`

### Deploy Technique Used (Current Workflow)
This is the exact command flow used to deploy without changing source files:

1. Stage/commit/push current state:
   - `git add -A`
   - `git commit -m "chore: snapshot current working state"`
   - If there are no file changes but you still want a new snapshot commit:
     - `git commit --allow-empty -m "chore: maintain working snapshot"`
   - `git push origin main`
2. Create a Vercel preview deployment:
   - `vercel deploy -y`
3. If `vercel.json` references secrets with `@secret_name` and those secrets are missing, deploy with temporary overrides:
   - Build-time (`-b`) and runtime (`-e`) values may both be required for frameworks that read env during build.
   - Example:
     - `vercel deploy -y -b NEXTAUTH_SECRET=... -b NEXTAUTH_URL=... -b API_KEY_ENCRYPTION_SEED=... -b DATABASE_URL=... -e NEXTAUTH_SECRET=... -e NEXTAUTH_URL=... -e API_KEY_ENCRYPTION_SEED=... -e DATABASE_URL=...`

### Make Every Push To `main` Auto-Deploy
Configure once in Vercel Project Settings:

1. Connect this GitHub repository to the Vercel project.
2. Set `Production Branch` to `main`.
3. Add required environment variables in Vercel for both `Production` and `Preview`:
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`
   - `API_KEY_ENCRYPTION_SEED`
   - `DATABASE_URL` (if your runtime/build path needs it)
   - CLI shortcut:
     - `vercel env add NEXTAUTH_SECRET production && vercel env add NEXTAUTH_SECRET preview`
     - `vercel env add NEXTAUTH_URL production && vercel env add NEXTAUTH_URL preview`
     - `vercel env add API_KEY_ENCRYPTION_SEED production && vercel env add API_KEY_ENCRYPTION_SEED preview`
4. Fix secret wiring so deploys do not depend on CLI overrides:
   - Option A: Create the Vercel secrets referenced in `vercel.json` (`@database_url`, `@nextauth_secret`, `@nextauth_url`, `@api_key_encryption_seed`).
   - Option B: Remove secret references from `vercel.json` and manage env vars directly in Vercel settings.
5. Ensure your Git author identity is valid and has access to the Vercel team/project (email must match an authorized member).

After this setup, every `git push origin main` should trigger a production deployment automatically via Vercel Git integration.

## Additional Docs
- `docs/OPERATOR_RUNBOOK.md`: startup, verification, deploy, rollback, incident runbooks
- `DOCS_SOURCE_OF_TRUTH.md`: authoritative-vs-historical doc map
- `DOCUMENTATION.md`: API/services/components reference
- `DESIGN_SYSTEM.md`: design tokens and UI conventions
- `ROADMAP.md`: roadmap and planned work
- `STATUS_UPDATE.md`: current repository status snapshot
- `SECURITY_AUDIT_TRIAGE.md`: latest dependency-audit triage and remediation notes
- `NEXT_UPGRADE_PLAYBOOK.md`: staged Next.js major-upgrade execution + rollback plan

## License
MIT (`LICENSE`)
