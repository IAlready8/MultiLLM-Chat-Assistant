# MultiLLM Chat Assistant

[![CI](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/IAlready8/MultiLLM-Chat-Assistant)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/IAlready8/MultiLLM-Chat-Assistant/main)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/commits/main)
[![Open Issues](https://img.shields.io/github/issues/IAlready8/MultiLLM-Chat-Assistant)](https://github.com/IAlready8/MultiLLM-Chat-Assistant/issues)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](https://nextjs.org)

Multi-LLM web app for chat, personas, analytics, comparison workflows, pipelines, and AI Roundtable.

## Highlights
- Multi-provider chat endpoints with streaming support
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

## Auth Modes
- Guest/demo mode (default for local dev):
  - `AUTH_REQUIRE_LOGIN=false`
  - `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false`
  - Allows using the app and saving provider keys without creating an account.
- Strict auth mode:
  - `AUTH_REQUIRE_LOGIN=true`
  - `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true`
  - Requires real session auth and explicit `NEXTAUTH_SECRET`.

## Scripts
- `npm run dev`: Start Next.js dev server
- `npm run build`: Create production build
- `npm run start`: Start production server
- `npm run lint`: ESLint (`--max-warnings=0`)
- `npm run type-check`: TypeScript checks
- `npm run test`: Vitest (watch)
- `npm run test:run`: Vitest one-shot
- `npm run test:coverage`: Vitest with coverage

## CI
GitHub Actions workflow: `.github/workflows/ci.yml`
- Installs dependencies
- Generates Prisma client
- Runs `npm run type-check`
- Runs `npm run lint`
- Runs `npm run build`

## Architecture Snapshot
- App/UI: Next.js App Router (`app/*`) + reusable components (`components/*`)
- API layer: route handlers in `app/api/*`
- Auth: NextAuth with credential + OAuth providers (`lib/auth.ts`)
- Data access:
  - Current runtime in this repo uses Prisma stubs in `lib/prisma.ts`
  - Services provide in-memory fallbacks for key and conversation flows
- Optional sidecar: FastAPI orchestration service in `src/core/*`

See full details in `ARCHITECTURE.md` and `PYTHON_INTEGRATION.md`.

## Environment
Primary reference: `.env.example`

Key groups:
- Auth/session: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_REQUIRE_LOGIN`, `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`
- Demo/guest behavior: `DEMO_ACCOUNT_*`, `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`, `GUEST_USER_*`
- Provider key encryption: `API_KEY_ENCRYPTION_SEED`
- Optional database: `DATABASE_URL`
- Optional sidecar routing: `PYTHON_CORE_URL`

## Deployment
- Vercel setup: `VERCEL_DEPLOYMENT.md`
- General deployment notes: `docs/DEPLOYMENT_GUIDE.md`

## Additional Docs
- `DOCUMENTATION.md`: API/services/components reference
- `DESIGN_SYSTEM.md`: design tokens and UI conventions
- `ROADMAP.md`: roadmap and planned work
- `STATUS_UPDATE.md`: historical status notes

## License
MIT (`LICENSE`)
