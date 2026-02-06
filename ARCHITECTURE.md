# Architecture Overview

## Goals
- Provide a modular multi-LLM web app with clear separation between UI, API, auth, and provider integrations.
- Support both strict authenticated usage and fast local demo/guest workflows.
- Keep deployment paths simple (Vercel/Node) with optional Python orchestration.

## Core Stack
- Frontend/App: Next.js 14 (App Router), React, TypeScript
- UI: Tailwind CSS + Radix UI + CVA patterns
- Auth: NextAuth (`lib/auth.ts`)
- API: Next.js Route Handlers (`app/api/*`)
- Data abstraction:
  - Prisma-shaped client in `lib/prisma.ts`
  - Service-layer fallbacks in memory for non-DB environments
- Validation: Zod in API endpoints
- Tests: Vitest (JS/TS), Pytest (optional Python side)

## Repository Layout
- `app/`: routes, layouts, pages, and API handlers
- `components/`: reusable React components
- `lib/`: auth, crypto, API clients, Prisma shim, utilities
- `services/`: app/domain services (conversation, persona, analytics, provider access)
- `prisma/`: schema and migrations
- `src/core/`: optional Python orchestration service

## Runtime Architecture
1. UI pages in `app/*` call route handlers in `app/api/*`.
2. API handlers rely on `lib/api-auth.ts` for identity/session checks.
3. Business logic executes in `services/*`.
4. Provider key and conversation flows persist through service-layer stores:
   - DB path when available
   - In-memory fallback when DB delegates are unavailable
5. LLM calls route through provider-aware handlers in `app/api/llm/*`.

## Authentication Model
- Strict auth mode (`AUTH_REQUIRE_LOGIN=true`):
  - Requires real login/session flows
  - Enforces `NEXTAUTH_SECRET`
- Guest/demo mode (`AUTH_REQUIRE_LOGIN=false`):
  - Supports bypass/guest behavior for local development
  - Allows non-account key setup and testing routes where enabled

Primary files:
- `lib/auth.ts`
- `lib/api-auth.ts`
- `lib/demo-account.ts`
- `components/auth-guard.tsx`

## Data and Persistence
Current code path in this repository uses a Prisma-compatible stub (`lib/prisma.ts`) in local/runtime contexts where DB access is not available.

Service-layer fallbacks:
- Provider config/key storage fallback: `lib/api-key-service.ts`
- Conversation fallback: `services/conversation-service.db.ts`

This keeps APIs functional in local/demo scenarios without requiring a running database.

## LLM and Orchestration
- Chat/stream endpoints:
  - `app/api/llm/chat/route.ts`
  - `app/api/llm/stream/route.ts`
- Optional orchestration bridge:
  - `app/api/llm/orchestrate/route.ts`
  - Proxies to Python core service (default `http://127.0.0.1:8008`)

## Build and Delivery
### Local Build
- `npm run type-check`
- `npm run lint`
- `npm run build`

### CI (GitHub Actions)
Workflow: `.github/workflows/ci.yml`
- Runs on push/PR to `main`
- Performs type-check, lint, and build
- Includes Prisma client generation step

### Deploy
- Vercel config: `vercel.json`
- Deployment notes:
  - `VERCEL_DEPLOYMENT.md`
  - `docs/DEPLOYMENT_GUIDE.md`

## Operational Notes
- Python sidecar is optional. Core web app routes function without it except orchestration-specific features.
- In-memory fallback data is process-local and non-durable.
- For durable production behavior, use a database-backed implementation and production auth settings.

## Related Docs
- `README.md`
- `DOCUMENTATION.md`
- `PYTHON_INTEGRATION.md`
- `.env.example`
