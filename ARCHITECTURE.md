# Architecture Overview

## Goals
- Provide a modular multi-LLM platform with clear separation between UI, API, auth, and service layers.
- Support both strict authenticated usage and guest-friendly local workflows.
- Keep deployment/release flow production-safe with CI, smoke tests, and runtime verification.

## Core Stack
- App/UI: Next.js 14 (App Router), React, TypeScript
- Styling/UI primitives: Tailwind CSS + Radix UI patterns
- Auth/session: NextAuth + custom auth helpers (`lib/auth.ts`, `lib/api-auth.ts`)
- API layer: Route Handlers under `app/api/*`
- Data layer:
  - Prisma runtime client when `DATABASE_URL` is configured (`lib/prisma.ts`)
  - DB-unavailable fallback strategy at service level
- Validation: Zod at route boundaries
- Testing: Vitest (unit/integration), optional Pytest for Python side

## Repository Layout
- `app/`: pages, layouts, API handlers
- `components/`: reusable UI and feature components
- `lib/`: auth, crypto, db/fallback helpers, shared utilities
- `services/`: domain services (conversations, personas, goals, analytics)
- `prisma/`: schema + migrations
- `src/core/`: optional Python orchestration sidecar

## High-Level Request Flow
1. UI routes call API routes in `app/api/*`.
2. API routes validate input and resolve identity via `getAuthenticatedUser`.
3. Domain operations execute in `services/*` or dedicated `lib/*` modules.
4. Persistence path is DB-first, with controlled in-memory fallback when DB access is unavailable.
5. Provider calls are routed through provider-aware LLM handlers (`/api/llm/*`).

## API Surface (Key Domains)
- Auth/session:
  - `/api/auth/[...nextauth]`
  - `/api/auth/upgrade-guest`
- Provider config and key lifecycle:
  - `/api/config`
  - `/api/provider-configs`
  - `/api/test-api-key`
- Core product flows:
  - `/api/conversations`, `/api/conversations/[id]`
  - `/api/goals`, `/api/goals/[id]`
  - `/api/personas`, `/api/personas/[id]`
  - `/api/llm/chat`, `/api/llm/stream`, `/api/llm/orchestrate`
- Ops/admin observability:
  - `/api/health`
  - `/api/admin/status`
  - `/api/admin/errors/stats`

## Authentication Model
- Strict auth mode (`AUTH_REQUIRE_LOGIN=true`):
  - Requires valid session flows
  - Requires `NEXTAUTH_SECRET`
- Guest/demo mode (`AUTH_REQUIRE_LOGIN=false`):
  - Guest-friendly access paths remain available where explicitly allowed
  - Supports local evaluation without full account setup

Primary auth files:
- `lib/auth.ts`
- `lib/api-auth.ts`
- `lib/demo-account.ts`
- `middleware.ts`

## Persistence and Fallback Model
- `lib/prisma.ts`:
  - Uses Prisma runtime client when `DATABASE_URL` is set.
  - Uses stub client when DB is not configured.
- Services implement DB-first + fallback behavior, including:
  - `lib/api-key-service.ts`
  - `services/conversation-service.db.ts`
  - `services/goal-service.db.ts`
  - `services/persona-service.db.ts`
  - `services/analytics-service.ts`
- Shared fallback behavior is centralized in `lib/db-fallback.ts`:
  - DB unavailability detection
  - retry-after interval (prevents permanent one-way fallback)
  - once-per-scope fallback warnings
  - capped in-memory store growth

## LLM and Orchestration
- Chat + streaming:
  - `app/api/llm/chat/route.ts`
  - `app/api/llm/stream/route.ts`
- Orchestration bridge:
  - `app/api/llm/orchestrate/route.ts`
  - Proxies to Python core (`PYTHON_CORE_URL`, default `http://127.0.0.1:8008`)
  - Includes local fallback orchestration path when sidecar is unavailable

## Build, QA, and Release Controls
### Local quality gates
- `npm run type-check`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run smoke`

### CI (`.github/workflows/ci.yml`)
- `Quality Checks` job:
  - install, generate prisma client, type-check, lint, unit tests, build
- `Smoke Tests` job:
  - Postgres service container
  - migrate deploy
  - start production server
  - execute smoke suite
- `Security Audit` job (non-blocking)

### Production verification + protection scripts
- `scripts/verify-production.sh` (`npm run verify:prod`)
  - validates env, DB reachability/migration status, optional Stripe/webhook checks
- `scripts/enforce-branch-protection.sh` (`npm run protect:main`)
  - enforces required checks on `main` (`Quality Checks`, `Smoke Tests`)

## Deployment
- Primary target: Vercel (`vercel.json`)
- Deployment docs:
  - `VERCEL_DEPLOYMENT.md`
  - `docs/DEPLOYMENT_GUIDE.md`

## Related Docs
- `README.md`
- `DOCUMENTATION.md`
- `PYTHON_INTEGRATION.md`
- `.env.example`
