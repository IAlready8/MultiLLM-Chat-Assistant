# Repository Instructions

## Project Overview

MultiLLM Chat Assistant is a Next.js 16 App Router application that provides multi-provider LLM chat with real-time streaming, encrypted API key storage, conversation persistence, and graceful database fallback in development and tests. In production, the app requires a real database and a valid `DATABASE_URL`. It deploys to Vercel with PostgreSQL via Prisma ORM.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 18, TypeScript 5 (`strict: true`)
- **Styling**: Tailwind CSS 3 + Radix UI headless primitives + CVA (class-variance-authority) + Framer Motion
- **Database**: Prisma 7 ORM with PostgreSQL; stub client + in-memory fallback when `DATABASE_URL` is absent in development/tests only — production deployments must set `DATABASE_URL`
- **Auth**: NextAuth.js v4 with Prisma adapter; supports strict auth, guest, and demo modes
- **Validation**: Zod 4 schemas in `lib/config-schemas.ts`; manual validators in `schemas/`
- **Payments**: Stripe 20
- **Testing**: Vitest 3 + Testing Library + jsdom; Playwright for E2E
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) running lint/tests/build/smoke tests; deployment to Vercel is handled via Vercel Git integration/CLI outside this workflow

## Directory Structure

```
app/                → Next.js App Router pages, layouts, API route handlers
  api/              → REST endpoints (auth, config, conversations, goals, personas, llm, health, admin, webhooks, subscriptions; teams is internal and flag-gated)
components/         → React components (kebab-case filenames, e.g. api-key-form.tsx); reusable UI primitives in components/ui/
lib/                → Core utilities: auth, crypto, Prisma client, rate limiting, logging, caching
  providers/        → LLM provider adapters implementing ProviderAdapter interface + registry
  api/              → Internal API helpers
services/           → Domain services with DB-first + in-memory fallback pattern
schemas/            → Request validation (manual validators)
types/              → TypeScript declarations (Prisma model types in types/prisma.ts, NextAuth augmentation in types/next-auth.d.ts)
prisma/             → schema.prisma and migrations
hooks/              → Custom React hooks (use-conversation.ts, use-goals.ts, use-personas.ts)
test/               → Vitest unit/integration tests (mirrors source paths)
tests/              → Mixed-language integration tests (Python pytest + TypeScript; optional backend/CLI utilities)
scripts/            → Shell scripts (smoke tests, production verification, branch protection, Next upgrade readiness)
src/core/           → Optional Python FastAPI sidecar, integrated via Next.js API proxy routes (e.g., app/api/llm/orchestrate)
docs/               → Extended documentation
```

## Commands

```bash
npm run dev              # Start Next.js dev server (webpack mode, localhost:3000)
npm run build            # Production build (runs prisma generate first)
npm run lint             # ESLint with --max-warnings=0 (zero tolerance)
npm run type-check       # TypeScript strict check (tsc --noEmit)
npm run test             # Vitest watch mode
npm run test:run         # Vitest single run
npm run test:run:local   # Single-threaded for sandbox environments
npm run test:coverage    # Vitest with V8 coverage
npm run smoke            # E2E smoke tests (requires running server + PostgreSQL)
npm run verify:prod      # Validate production deployment
npm run protect:main     # Enforce branch protection rules
```

## Quality Gates (Required Before PR)

All four must pass before opening a pull request:

1. `npm run lint` — zero warnings allowed
2. `npm run type-check` — no type errors
3. `npm run test:run` — all tests pass
4. `npm run build` — successful production build

## Architecture Patterns

### 1. DB-First with In-Memory Fallback

Every domain service (`services/*-service.db.ts`, `lib/api-key-service.ts`) uses `createDbAvailabilityTracker()` from `lib/db-fallback.ts`:

```typescript
const db = createDbAvailabilityTracker()

// In every method:
if (db.isKnownUnavailable()) {
  return fallbackStore.get(...)
}
try {
  return await prisma.model.operation(...)
} catch (error) {
  db.markUnavailableIfNeeded(error)
  return fallbackStore.get(...)
}
```

- The tracker retries the database after 60 seconds (`DB_RETRY_INTERVAL_MS`)
- Fallback stores are `Map<userId, Map<entityId, Entity>>` with a maximum of 100 users; when full, the oldest inserted user is evicted (FIFO based on `Map` insertion order)
- Always use `getOrCreateUserStore()` from `lib/db-fallback.ts` for per-user isolation
- The Prisma client in `lib/prisma.ts` returns a stub client when `DATABASE_URL` is empty — stub methods throw descriptive errors that trigger the fallback path

Services following this pattern:
- `services/conversation-service.db.ts`
- `services/goal-service.db.ts`
- `services/persona-service.db.ts`
- `services/analytics-service.ts`
- `lib/api-key-service.ts`

### 2. Provider Adapter Pattern

LLM providers are abstracted via `ProviderAdapter` in `lib/providers/types.ts`:

```typescript
interface ProviderAdapter {
  readonly id: string
  testConnection?(config: ProviderAdapterConfig): Promise<void>
  chat(request: ProviderRequest, config: ProviderAdapterConfig): Promise<ChatCompletion>
  stream(request: ProviderRequest, config: ProviderAdapterConfig): AsyncGenerator<string>
}
```

Adapters are registered in `lib/providers/registry.ts` and exported via `lib/providers/index.ts`. Current providers: `openai`, `anthropic`, `googleai`, `grok`, `openrouter`.

**To add a new provider:**
1. Create `lib/providers/<name>.ts` implementing `ProviderAdapter`
2. Add the adapter to the `adapters` record in `lib/providers/registry.ts`
3. Add the provider ID to the `ProviderId` union type in `lib/providers/types.ts`
4. Add metadata to `lib/provider-registry.ts` (display name, key placeholder)
5. Add default models and rate limits in `lib/config-schemas.ts`

Error classification is unified in `lib/providers/errors.ts` via `classifyProviderError()`. The non-streaming JSON responses from `/api/llm/chat` and `/api/llm/stream` use this function so structured error payloads are consistent for the same failure modes; the streaming path of `/api/llm/chat` may surface provider errors directly via the stream transport.

### 3. Authentication Model

Controlled by `AUTH_REQUIRE_LOGIN` / `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN` environment variables. Logic lives in `lib/api-auth.ts` and `lib/demo-account.ts`.

- **Strict mode** (`true`): Requires valid NextAuth session; unauthenticated requests get 401
- **Guest/Demo mode** (`false`): Creates guest users via `createGuestUserRecord()` or demo users via `createDemoUserRecord()`. Guest-to-user upgrade available at `POST /api/auth/upgrade-guest`

All API routes authenticate via `getAuthenticatedUser()` from `lib/api-auth.ts`. Most routes pass `{ allowGuest: true }`. JWT decryption errors (e.g., rotated secrets) are handled gracefully as "no session" rather than 500s.

### 4. API Key Encryption

User API keys are encrypted with AES-256-GCM before storage. The flow:
- Key derivation: SHA-256 of `API_KEY_ENCRYPTION_SEED` → 32-byte key (`lib/crypto.ts`)
- Encryption: `aesGcmEncrypt()` produces `v2:gcm:<base64>` tokens
- Decryption: `aesGcmDecrypt()` reverses the process
- CRUD operations in `lib/api-key-service.ts`
- **Never store or log plaintext API keys**

### 5. Streaming

Two streaming endpoints:
- `/api/llm/chat` (with `stream: true` in body) — returns raw `text/plain` stream
- `/api/llm/stream` — returns NDJSON (`application/x-ndjson`) with event types: `chunk`, `done`, `error`

Client-side NDJSON parsing is in `services/ndjson.ts` via `iterNdjson()`.

### 6. Error Handling

Use the structured error system in `lib/error-system.ts`:
- Extend `BaseAppError` for domain errors: `ValidationError`, `NetworkError`, `LLMProviderError`, `DatabaseError`, `AuthenticationError`, `RateLimitError`, `NotImplementedError`
- Use `errorManager.logError()` for centralized logging; critical errors are persisted to the Analytics table
- Provider errors are classified via `classifyProviderError()` from `lib/providers/errors.ts`

### 7. API Route Pattern

All API route handlers follow this structure:

```typescript
export async function POST(req: NextRequest) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  // Validate request body
  // Call domain service or provider adapter
  // Record analytics event (fire-and-forget via safeRecordEvent)
  // Return NextResponse.json(result)
}
```

Use `jsonErrorResponse(status, error, code)` for error responses. Always include a machine-readable `code` field alongside the human-readable `error` string.

## Database Schema

Key Prisma models in `prisma/schema.prisma`:
- **User**, **Account**, **Session**, **VerificationToken** — NextAuth standard tables
- **Conversation** → has many **Message** (cascade delete, indexed on `conversationId`)
- **ProviderConfig** — encrypted API keys per user per provider (`@@unique([userId, provider])`)
- **Analytics** — event tracking with JSON `payload` string
- **Goal** — user-owned goal tracking (`status` defaults to `"pending"`)
- **Persona** — user-owned AI personas with `prompt` field
- **Team** / **TeamMember** — organization support (role as string, not enum)
- **Subscription** — Stripe integration fields (`stripeCustomerId`, `stripeSubscriptionId`, etc.)

TypeScript interfaces for these models live in `types/prisma.ts`, including the `PrismaModelDelegate<T>` and `PrismaClient` types used by the stub client.

After schema changes:
- Local: `npx prisma migrate dev`
- Production: `npx prisma migrate deploy`
- Always run `npx prisma generate` (runs automatically via `postinstall` and as part of `build:webpack` / `build:turbopack`)

## Code Style & Naming Conventions

| Category | Convention |
|---|---|
| Components | kebab-case filenames in `components/` and `components/ui/` |
| Hooks | `use-*.ts` in `hooks/` |
| Utilities / services | kebab-case in `lib/` and `services/` |
| Tests | `*.test.ts(x)` in `test/`, mirror source paths |
| Formatting | 2 spaces, single quotes, trailing commas, ~80 char line width (via ESLint/editor configuration; no Prettier requirement) |
| TypeScript | `strict: true`; explicit types at module boundaries; avoid `any` at public interfaces |
| Imports | Use `@/*` path alias (mapped to repo root via `tsconfig.json`) |
| CSS classes | Use `cn()` from `lib/utils.ts` for merging Tailwind classes |
| Design tokens | Use semantic CSS variables (`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`) consumed as `hsl(var(--token))` |
| Component variants | Use CVA (class-variance-authority) for variant props |
| Commits | Conventional Commits: `feat:`, `fix:`, `perf:`, `chore:`, `docs:` with optional scopes (e.g., `feat(security):`) |
| Commit tense | Present tense, imperative mood ("Add feature" not "Added feature") |
| PR requirements | Clear description, linked issues, screenshots for UI changes, migration notes if Prisma schema changed |

## UI Components

Reusable primitives in `components/ui/` are built on Radix UI: `alert`, `avatar`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `progress`, `sheet`, `skeleton`, `tabs`, `textarea`, `toaster`, `use-toast`.

**Always check `components/ui/` before creating a new primitive.** Follow the CVA variant pattern and `cn()` utility for class merging. Design tokens are defined as CSS custom properties in `app/globals.css` and consumed in `tailwind.config.ts`. Dark/light mode is handled by `next-themes` with class strategy (`darkMode: ["class"]`).

## Testing

- **Framework**: Vitest with jsdom environment; setup file at `test/setup.tsx`
- **Location**: Tests in `test/` directory, mirroring source paths (e.g., `test/api-llm-chat-route.test.ts` tests `app/api/llm/chat/route.ts`)
- **Mocking**: `test/setup.tsx` mocks `next/navigation`, `next-auth/react`, `localStorage`, `ThemeProvider`, and `Slider` component globally
- **Stability**: Avoid flaky timers and real network calls; mock external dependencies
- **Coverage**: V8 provider; excludes `node_modules/`, `.next/`, `prisma/`, `**/*.config.*`, `test/`
- **CI mode**: Uses `pool: 'forks'` for stability; local defaults to `pool: 'threads'`
- **Python tests**: Optional; run with `pytest -q` in `tests/`

## CI Pipeline

Defined in `.github/workflows/ci.yml`, triggers on push/PR to `main`:

1. **Quality Checks**: `npm ci` → `prisma generate` → `type-check` → `lint` → `test:run` → `build`
2. **Smoke Tests** (depends on Quality Checks): PostgreSQL 16 service container → `prisma migrate deploy` → build → start server → `scripts/smoke-test.sh`
3. **Coverage**: `npm run coverage` with enforced global thresholds
4. **Security Audit**: tracked-secret scan, blocking high/critical production audit, and blocking critical full-tree audit

Node 22 LTS is used from `.nvmrc`. Build requires placeholder env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `API_KEY_ENCRYPTION_SEED`.

## Environment Variables

**Required in production (validated by `scripts/verify-production.sh`):**
- `DATABASE_URL` — PostgreSQL connection string (**required in production**; in local/dev the app can fall back to an in-memory stub when this is absent)
- `NEXTAUTH_URL` — application base URL (e.g., `http://localhost:3000`)
- `API_KEY_ENCRYPTION_SEED` — seed for AES-256-GCM key derivation (generate with `openssl rand -base64 32`)
- `NEXTAUTH_SECRET` **or** `AUTH_SECRET` — NextAuth secret for signing/encryption (**required in production**; in local/dev NextAuth can use a hardcoded fallback, but setting it is recommended for consistency)

**Additional / optional (feature- or scale-dependent):**
- `REDIS_URL` — for distributed rate limiting (`lib/rate-limit.ts`) and caching (`lib/cache.ts`); not used for NextAuth session storage
- `AUTH_REQUIRE_LOGIN` / `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN` — `true` for strict authentication
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` — for payment features
- `PYTHON_CORE_URL` — URL for optional Python sidecar (default `http://127.0.0.1:8008`)

**Demo/Guest overrides:**
- `DEMO_ACCOUNT_ENABLED`, `DEMO_ACCOUNT_BYPASS_AUTH`, `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`
- `DEMO_ACCOUNT_EMAIL`, `DEMO_ACCOUNT_PASSWORD`, `DEMO_ACCOUNT_NAME`, `DEMO_ACCOUNT_ID`
- `GUEST_USER_ID`, `GUEST_USER_NAME`, `GUEST_USER_EMAIL`

**OAuth Providers (optional):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

**LLM API Keys (optional — users can supply their own via the settings UI):**
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`

Copy `.env.example` to `.env.local` for local development. **Never commit secrets.**

## Key Files Reference

| File | Purpose |
|---|---|
| `lib/api-auth.ts` | `getAuthenticatedUser()` — used by all API routes |
| `lib/auth.ts` | NextAuth configuration, `resolveAuthSecret()`, credential + OAuth providers |
| `lib/db-fallback.ts` | DB availability tracker + in-memory fallback utilities |
| `lib/prisma.ts` | Prisma client initialization with stub fallback |
| `lib/crypto.ts` | AES-256-GCM encryption/decryption for API keys |
| `lib/providers/registry.ts` | Provider adapter lookup via `getProviderAdapter()` |
| `lib/providers/types.ts` | `ProviderAdapter`, `ProviderRequest`, `ChatCompletion` interfaces |
| `lib/providers/errors.ts` | `classifyProviderError()` — unified error classification |
| `lib/config-schemas.ts` | Zod schemas for provider/system config + defaults |
| `lib/error-system.ts` | Structured error classes + `ErrorManager` singleton |
| `lib/demo-account.ts` | Guest/demo user creation and auth bypass logic |
| `lib/rate-limit.ts` | Redis-backed (with memory fallback) rate limiting |
| `lib/cache.ts` | Redis-backed (with memory fallback) caching layer |
| `lib/utils.ts` | `cn()` Tailwind class merge helper |
| `types/prisma.ts` | TypeScript interfaces for all Prisma models + `PrismaClient` type |
| `services/*-service.db.ts` | Domain services with DB fallback pattern |
| `services/ndjson.ts` | `iterNdjson()` async iterator for NDJSON streams |
| `app/api/llm/chat/route.ts` | Main chat endpoint (streaming + non-streaming) |
| `app/api/llm/stream/route.ts` | NDJSON streaming endpoint |
| `test/setup.tsx` | Global test setup (mocks for Next.js, NextAuth, localStorage) |

## API Surface

- **Auth**: `/api/auth/[...nextauth]`, `/api/auth/upgrade-guest`
- **Config**: `/api/config`, `/api/provider-configs`, `/api/test-api-key`
- **Core**: `/api/conversations`, `/api/conversations/[id]`, `/api/goals`, `/api/goals/[id]`, `/api/personas`, `/api/personas/[id]`
- **LLM**: `/api/llm/chat`, `/api/llm/stream`, `/api/llm/orchestrate`
- **Billing**: `/api/subscriptions`, `/api/webhooks/stripe`
- **Teams**: `/api/teams` (internal, flag-gated, disabled by default)
- **Ops**: `/api/health`, `/api/admin/status`, `/api/admin/errors/stats`, `/api/analytics`

## Supported LLM Providers

| Provider ID | Display Name | Key Format |
|---|---|---|
| `openai` | OpenAI | `sk-...` |
| `openrouter` | OpenRouter | `sk-or-v1-...` |
| `anthropic` | Claude (Anthropic) | `sk-ant-...` |
| `googleai` | Google AI | `AIza...` |
| `grok` | Grok (xAI) | `xai-...` |

## Deployment

Primary target is Vercel. See `.github/DEPLOYMENT.md` and `VERCEL_DEPLOYMENT.md` for full guides. Key steps:
1. Set environment variables in Vercel dashboard
2. Run `npx prisma migrate deploy` against production database
3. Deploy with `vercel --prod`
4. Verify with `npm run verify:prod`

---
