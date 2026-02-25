# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Essential commands for working in this codebase:

- **Development**: `npm run dev` (starts Next.js dev server on localhost:3000)
- **Database**: `npx prisma generate` (generates Prisma client after schema changes)
- **Build**: `npm run build` (production build, runs `prisma generate` automatically via postinstall)
- **Testing**:
  - `npm run test` (Vitest watch mode)
  - `npm run test:run` (single test run)
  - `npm run test:run:local` (single-threaded for sandbox environments)
  - `npm run test:coverage` (test with coverage report)
  - `npm run test:ci` (CI test run with coverage)
- **Type Checking**: `npm run type-check` (TypeScript strict checks)
- **Linting**: `npm run lint` (ESLint with Next.js core-web-vitals rules, zero warnings allowed)
- **E2E Tests**: Playwright configured in `playwright.config.ts` (Chromium, Firefox, WebKit, mobile)
- **Migrations**: `npx prisma migrate dev` (local), `npx prisma migrate deploy` (production)

## Architecture Overview

This is a Next.js 14 App Router application (v16.1.1 runtime) providing a multi-provider LLM chat platform.

### Core Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript (strict mode, ES2020 target)
- **Styling**: Tailwind CSS + Radix UI primitives + Class Variance Authority (CVA) + tailwind-merge
- **Database**: Prisma ORM v7.3 with PostgreSQL (via @prisma/adapter-pg)
- **Authentication**: NextAuth.js v4 with Prisma adapter, JWT sessions (30-day max age)
- **Payments**: Stripe for subscriptions (FREE/PRO tiers)
- **Caching**: Dual-layer (in-memory + optional Redis via REDIS_URL)
- **Testing**: Vitest + Testing Library + jsdom + Playwright (E2E)
- **Validation**: Zod v4 for schema validation
- **Icons**: Lucide React
- **Charts**: Recharts
- **Animation**: Framer Motion

### Directory Structure

```
app/                    Next.js App Router pages, layouts, and API routes
  api/                  REST API endpoints
    admin/              Admin dashboard endpoints (errors, status)
    analytics/          Usage analytics endpoint
    auth/               NextAuth routes + guest upgrade
    config/             Provider configuration CRUD
    conversations/      Conversation CRUD with messages
    goals/              Goal tracking CRUD
    health/             Health check with DB/cache status
    llm/                LLM endpoints (chat, stream, orchestrate)
    personas/           Persona CRUD
    provider-configs/   Provider config management
    subscriptions/      Stripe subscription management
    teams/              Team management
    test-api-key/       API key validation endpoint
    webhooks/stripe/    Stripe webhook handler
  admin/                Admin UI pages (errors dashboard, system status)
  ai-roundtable/        Multi-agent debate arena
  analytics/            Usage analytics dashboard
  api-test/             API connectivity testing UI
  auth/                 Auth pages (signin, signout, error)
  billing/              Subscription management UI
  comparison/           Model comparison interface
  goal-hub/             Goal tracking and management
  multi-chat/           Main multi-model chat interface
  personas/             AI persona management
  pipeline/             Multi-provider orchestration UI
  settings/             Application settings (profile, providers, appearance)
components/             Reusable React components
  ui/                   UI primitives (button, card, dialog, tabs, etc.)
hooks/                  Custom React hooks (use-conversation, use-goals, use-personas)
lib/                    Shared utilities and core infrastructure
  api/                  API middleware (rate-limiter, circuit-breaker, error-handler)
  providers/            LLM provider adapters (openai, anthropic, googleai, grok, openrouter)
prisma/                 Database schema and migrations
schemas/                Request validation schemas (llm.ts)
services/               Business logic and data access layer
test/                   Unit and integration tests
  e2e/                  Playwright end-to-end tests
types/                  TypeScript type definitions
```

### Key Features

- **Multi-LLM Chat** (`/multi-chat`): Send messages to multiple LLM providers simultaneously with streaming responses
- **AI Roundtable** (`/ai-roundtable`): Multi-agent debate arena with round-robin agent responses, custom system prompts per agent, configurable turn limits (2-30)
- **Goal Hub** (`/goal-hub`): Goal tracking with subtasks, due dates, status (not-started/in-progress/delayed/completed), progress calculation
- **Model Comparison** (`/comparison`): Side-by-side model metrics (response time, tokens/sec, accuracy, cost) and response comparison from conversations
- **Pipeline** (`/pipeline`): Multi-provider orchestration with parallel execution, cost/latency tracking
- **Personas** (`/personas`): Custom AI personas with system prompts (starter: Helpful Assistant, Code Reviewer, Creative Writer)
- **Analytics** (`/analytics`): Usage tracking with time-series charts, provider comparison, model metrics (24h/7d/30d)
- **Settings** (`/settings`): Profile, provider API keys, theme (dark/light/system), font scaling, data export/import
- **Admin** (`/admin`): Error dashboard with category/severity breakdown, system status with health checks
- **Billing** (`/billing`): Stripe subscription management (FREE/PRO tiers)

## Database Schema

Defined in `prisma/schema.prisma` with PostgreSQL:

| Model | Purpose | Key Fields | Relations |
|---|---|---|---|
| **User** | Core user entity | email (unique), password, name, image | accounts, sessions, conversations, goals, personas, providerConfigs, subscription |
| **Account** | OAuth accounts (NextAuth) | provider+providerAccountId (unique) | cascade delete on user |
| **Session** | Active sessions (NextAuth) | sessionToken (unique) | cascade delete on user |
| **VerificationToken** | Email verification | identifier+token (unique) | - |
| **Conversation** | Chat threads | title, userId | messages (cascade), cascade on user |
| **Message** | Chat messages | role, content, provider, model, conversationId | indexed on conversationId, cascade on conversation |
| **ProviderConfig** | LLM provider keys | userId+provider (unique), encryptedApiKey, settings (JSON), isActive | cascade on user |
| **Analytics** | Event tracking | event, payload (JSON string), userId | - |
| **Goal** | Goal tracking | title, description, status, userId | cascade on user |
| **Persona** | AI personas | title, description, prompt, userId | cascade on user |
| **Team** | Organization entity | name | members |
| **TeamMember** | User-Team join | userId+teamId (unique), role (OWNER/ADMIN/MEMBER) | cascade on both |
| **Subscription** | Stripe billing | userId (unique), tier (FREE/PRO), stripeCustomerId, stripeSubscriptionId | cascade on user |

All core entities have `id`, `createdAt`, `updatedAt` fields. Cascade deletes ensure referential integrity.

## LLM Provider Architecture

### Provider Adapter Pattern (`lib/providers/`)

Each provider implements the `ProviderAdapter` interface from `lib/providers/types.ts`:

```typescript
interface ProviderAdapter {
  testConnection?(config: ProviderAdapterConfig): Promise<boolean>;
  chat(request: ProviderRequest, config: ProviderAdapterConfig): Promise<ChatCompletion>;
  stream(request: ProviderRequest, config: ProviderAdapterConfig): AsyncGenerator<string>;
}
```

**Registered providers** (`lib/providers/registry.ts`):

| Provider ID | Adapter File | Base URL | Default Model | Key Prefix |
|---|---|---|---|---|
| `openai` | `openai.ts` | `api.openai.com/v1` | gpt-3.5-turbo | `sk-` |
| `anthropic` | `anthropic.ts` | `api.anthropic.com` | claude-3-sonnet-20240229 | `sk-ant-` |
| `googleai` | `googleai.ts` | `generativelanguage.googleapis.com/v1beta` | gemini-1.5-flash | `AIza` |
| `openrouter` | `openrouter.ts` | `openrouter.ai/api/v1` | openrouter/auto | `sk-or-` |
| `grok` | `grok.ts` | `api.x.ai/v1` | grok-beta | `xai-` |

**Provider-specific notes:**
- Anthropic: Separates system messages from user/assistant, uses `x-api-key` header, API version `2023-06-01`
- Google AI: Uses `contents` array with user/model roles, API key in query param, system instruction as separate field
- OpenRouter: Supports `extraHeaders` for HTTP-Referer and X-Title
- Grok: OpenAI-compatible API format

### Streaming Protocols

Two streaming modes available:

1. **NDJSON** (`/api/llm/stream`): Newline-delimited JSON with event types `chunk`, `done`, `error`, `aborted`
   - Content-Type: `application/x-ndjson`
   - Uses TransformStream with Writer for backpressure management
   - Client parser: `services/ndjson.ts` (async generator)

2. **SSE/Plain Text** (`/api/llm/chat` with stream flag): Direct text/plain streaming
   - Token estimation: message length / 4
   - Used by multi-chat and roundtable pages

### Orchestration (`/api/llm/orchestrate`)

- Primary: Bridges to Python FastAPI service at `http://127.0.0.1:8008` (via PM2)
- Fallback: Local orchestration calling `/api/llm/chat` for each provider if Python service unavailable
- 60-second timeout with AbortController
- Response includes `x-orchestration-fallback` header when in fallback mode

### Error Classification (`lib/providers/errors.ts`)

Unified `classifyProviderError()` maps errors to standardized codes:
- 401/403 → `PROVIDER_AUTH_ERROR`
- 429 → `RATE_LIMITED`
- 5xx → `PROVIDER_UNAVAILABLE`
- Timeout → `PROVIDER_TIMEOUT`
- Network → `NETWORK_ERROR`
- Other 4xx → `PROVIDER_REQUEST_ERROR`

## API Route Patterns

All API routes follow consistent patterns:

### Authentication
- `getAuthenticatedUser()` from `lib/api-auth.ts` handles auth for all routes
- Three modes: demo account bypass → guest user → NextAuth session
- Returns `{ user }` or `NextResponse` with 401/503
- JWT decryption errors trigger 401 "Session expired"
- DB unavailability returns 503 "Auth unavailable"

### Response Format (`lib/http.ts`)
```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string, details?: any } }
```

### Rate Limiting
- Per-user, per-provider sliding window (`lib/provider-rate-limit.ts`)
- General rate limiting with dual backend: in-memory + Redis (`lib/rate-limit.ts`)
- Default limits: OpenAI 60/min, Anthropic 50/min, OpenRouter 200/min

### Circuit Breaker (`lib/circuit-breaker.ts`)
- States: CLOSED → OPEN (after 5 failures) → HALF_OPEN (after timeout) → CLOSED (after 3 successes)
- Provider-specific timeouts: openai 30s, anthropic 45s, google 60s
- Sliding window failure rate monitoring

### API Key Management (`lib/api-key-service.ts`)
- Encryption: AES-256-GCM with derived keys from `API_KEY_ENCRYPTION_SEED`
- Format: `v2:gcm:${base64(iv + ciphertext + tag)}`
- Dual storage: Prisma DB + in-memory fallback Map
- Key operations: `storeUserApiKey()`, `getUserApiKey()`, `hasValidApiKey()`

### Structured Logging (`lib/api-logger.ts`)
- JSON logging with timestamp, level, method, path, status, duration
- In-memory metrics store with route-level aggregation
- Exposed via `/api/health?metrics=1`

## Authentication & Security

### NextAuth Configuration (`lib/auth.ts`)
- **Session Strategy**: JWT with 30-day max age
- **Providers**: Credentials (email/password), Google OAuth, GitHub OAuth (conditionally enabled)
- **Password**: bcrypt hashing with 10 salt rounds, 8-char minimum
- **Rate Limiting**: 10 login attempts per email per 15 minutes
- **Demo Mode**: Configurable demo account bypass for development
- **Guest Mode**: Guest user with fallback data stores

### Session Enrichment
- JWT callbacks add: `user.id`, `user.role` (default: MEMBER), `user.tier` (from Subscription, default: FREE)
- Session callbacks propagate these to client-side session object

### Auth Guard (`components/auth-guard.tsx`)
- Client-side route protection with optimistic rendering (150ms delay)
- 4-second timeout with "Go to sign in" fallback
- Public paths: `/auth/*` routes bypass guard
- Demo bypass: renders children immediately if enabled

### Guest Data Migration (`lib/guest-migration.ts`)
- On sign-in, migrates guest data to authenticated user
- Targets: goals, provider configs (re-encrypted), conversations (with messages), personas
- Triggered via `/api/auth/upgrade-guest` POST endpoint

### API Key Encryption (`lib/crypto.ts`)
- Server: Node.js `crypto` module (AES-256-GCM)
- Client: Web Crypto API
- Key derivation: SHA-256 from seed
- IV: 12 bytes random, Auth tag: 16 bytes
- Legacy format support for backward compatibility

## Component Architecture

### Layout Stack (`app/layout.tsx`)
```
AuthProvider (NextAuth SessionProvider)
  └─ ThemeProvider (next-themes, dark default)
      └─ AuthGuard (route protection)
          └─ Navbar + Toaster + Page Content
```

### UI Component Library (`components/ui/`)

All UI primitives are Radix UI-based wrappers with Tailwind CSS + CVA variants:

| Component | Radix Primitive | Variants |
|---|---|---|
| Button | Slot (asChild) | default, destructive, outline, secondary, ghost, link + sm, lg, icon sizes |
| Dialog | Dialog | Overlay + Content with slide/zoom animations |
| DropdownMenu | DropdownMenu | Items, checkbox items, radio items, separators |
| Sheet | Dialog | Side variants: top, bottom, left, right |
| Tabs | Tabs | Active state styling with data attributes |
| Avatar | Avatar | Image + Fallback (initials) |
| Progress | Progress | Value-based translateX fill |
| Badge | - (CVA) | default, secondary, destructive, outline |
| Alert | - | role="alert" with title + description |
| Card | - | Header, Title, Description, Content, Footer |

### Toast System (`components/ui/use-toast.tsx`)
- Global state via reducer pattern (ADD/UPDATE/DISMISS/REMOVE actions)
- `toast()` function and `useToast()` hook
- Variants: default, destructive
- Max 20 toasts, auto-dismiss with open state
- Positioned: bottom-right on desktop, top on mobile

### Key Application Components

| Component | File | Purpose |
|---|---|---|
| ApiKeyForm | `components/api-key-form.tsx` | Provider API key management with health checking |
| AuthGuard | `components/auth-guard.tsx` | Route protection with timeout handling |
| ConversationManager | `components/conversation-manager.tsx` | Save/load/delete conversations |
| ErrorBoundary | `components/error-boundary.tsx` | Multi-level error recovery (page/component/feature) |
| ExportImportDialog | `components/export-import-dialog.tsx` | Password-encrypted data backup/restore |
| Navbar | `components/navbar.tsx` | Main navigation with responsive mobile menu |
| PersonaManager | `components/persona-manager.tsx` | Persona CRUD UI |
| UserNav | `components/user-nav.tsx` | Avatar dropdown with session info |

### Error Boundary Levels (`components/error-boundary.tsx`)
- `PageErrorBoundary`: Full-page recovery with Go Home + Report buttons
- `ComponentErrorBoundary`: Alert fallback within page
- `FeatureErrorBoundary`: Feature-scoped with custom fallback
- Automatic recovery attempts via `errorManager`

## Custom Hooks

All hooks follow a consistent pattern: **fetch on mount → state management → optimistic mutations → rollback on error**.

### `useConversation()` (`hooks/use-conversation.ts`)
- **State**: `conversationList`, `activeConversation` (with messages), `isLoadingList`, `isLoadingMessages`, `error`
- **Methods**: `loadConversation(id)`, `createConversation(title, messages)`, `addMessages(messages)`, `deleteConversation(id)`, `clearActiveConversation()`
- **API**: Uses `apiClient` for all server calls

### `useGoals()` (`hooks/use-goals.ts`)
- **State**: `goals[]`, `isLoading`, `error`
- **Methods**: `refreshGoals()`, `createGoal(data)`, `updateGoal(id, updates)`, `deleteGoal(id)`
- **API**: Uses `apiClient` for all server calls

### `usePersonas()` (`hooks/use-personas.ts`)
- **State**: `personas[]`, `isLoading`, `error`
- **Methods**: `refreshPersonas()`, `createPersona(data)`, `updatePersona(id, updates)`, `deletePersona(id)`
- **API**: Uses `apiClient` for all server calls

## Services Layer

### Data Access (Server-Side with DB Fallback)

All `*.db.ts` services implement dual-storage: Prisma DB + in-memory fallback Maps.

| Service | File | Operations | Fallback |
|---|---|---|---|
| ConversationService | `services/conversation-service.db.ts` | CRUD + messages, transactions | Per-user Map with deep cloning |
| GoalService | `services/goal-service.db.ts` | CRUD with status normalization | Per-user Map, max 100 users FIFO |
| PersonaService | `services/persona-service.db.ts` | CRUD sorted by title | Per-user Map |
| TeamService | `services/team-service.db.ts` | Create, list, detail with roles | N/A |
| AnalyticsService | `services/analytics-service.ts` | Record events, aggregate stats | Global Map, 2000 events/user cap |

**Goal status aliases**: pending/todo/new → not-started, active/doing → in-progress, blocked → delayed, done → completed

### Client-Side Services

| Service | File | Purpose |
|---|---|---|
| apiClient | `lib/api-client.ts` | Unified fetch client for all `/api/*` endpoints (personas, goals, conversations, orchestration) |
| StreamClient | `services/stream-client.ts` | NDJSON stream consumer with AbortController |
| NDJSON Parser | `services/ndjson.ts` | Async generator for ReadableStream parsing |
| ConversationStorage | `services/conversation-storage.ts` | Browser-side IndexedDB storage (legacy) |
| ExportImport | `services/export-import-service.ts` | Encrypted data export/import with password |
| PersonaService | `services/persona-service.ts` | Persona utilities (apply system prompts, defaults) |

### LLM Client Services

| Service | File | Side | Purpose |
|---|---|---|---|
| api-service.ts | `services/api-service.ts` | Server | Provider adapter orchestration with error context |
| server-api-client.ts | `services/server-api-client.ts` | Server | Direct provider calls with encrypted DB keys |
| api-client.ts | `services/api-client.ts` | Client | Legacy client-side LLM calls with secure storage |
| llm-api-client.ts | `lib/llm-api-client.ts` | Both | Direct provider calls with caching (10-min TTL) |

## Infrastructure & Utilities (`lib/`)

### Caching (`lib/cache.ts`)
- **MemoryCache**: In-process Map with timeout-based expiration
- **RedisCache**: Optional via `REDIS_URL` environment variable
- **Unified Cache**: Memory-first read, dual write
- **TTL Presets**: short (5m), medium (1h), long (24h), llmResponse (30m), session (2h), analytics (6h)
- **Key patterns**: `llm:${provider}:${model}:${hash}`, `user:${userId}:session`, `rate_limit:${id}`

### Error System (`lib/error-system.ts`)
- **Error hierarchy**: BaseAppError → ValidationError, NetworkError, LLMProviderError, DatabaseError, AuthenticationError, RateLimitError
- **Categories**: VALIDATION, NETWORK, LLM_PROVIDER, DATABASE, AUTHENTICATION, RATE_LIMIT, SYSTEM, UNKNOWN
- **Severity**: LOW, MEDIUM, HIGH, CRITICAL
- **ErrorManager** singleton: structured logging, recovery strategies, critical error persistence to Analytics table

### Performance Monitor (`lib/performance-monitor.ts`)
- Request duration/count/status tracking
- Token usage monitoring
- System metrics: CPU, memory, event loop lag, cache hit rate
- Alert system with configurable thresholds
- Export: JSON and Prometheus formats

### Database Fallback (`lib/db-fallback.ts`)
- `createDbAvailabilityTracker()`: Scoped DB availability detection
- 60-second retry interval before re-attempting DB
- Per-user fallback Maps with 100-user FIFO eviction
- FK constraint errors treated specially (user not found)

### Configuration Management (`lib/config-manager.ts`)
- Singleton `configManager` for system config
- 5-minute cache for system configuration
- Zod validation of all config values
- Provider config encryption/decryption
- Health check endpoint

### Prisma Client (`lib/prisma.ts`)
- Conditional creation based on `DATABASE_URL`
- Stub client with error delegates when no DB configured
- Cached in `globalThis.__multiLlmPrismaClient` (non-production)
- Uses `@prisma/adapter-pg` for native PostgreSQL

## Type System

### Core Types (`types/prisma.ts`)

```typescript
BaseModel { id: string; createdAt: Date; updatedAt: Date }
User extends BaseModel { name?, email? (unique), password?, image? }
Conversation extends BaseModel { title, userId }
Message { id, role: 'user'|'assistant'|'system', content, provider?, model?, conversationId }
Goal extends BaseModel { title, description?, status, userId }
Persona extends BaseModel { title, description?, prompt, userId }
Team extends BaseModel { name }
Subscription extends BaseModel { userId, tier, stripeCustomerId?, ... }
```

### NextAuth Augmentation (`types/next-auth.d.ts`)
- Session.user extended with `id: string`
- JWT extended with `id`, `role`, `tier` in `lib/auth.ts`

### Provider Types (`lib/providers/types.ts`)
- `ProviderId`: Union of all provider ID strings
- `ProviderAdapter`: Interface with `chat()`, `stream()`, optional `testConnection()`
- `ProviderRequest`: Messages array + model/temperature/max_tokens
- `ChatCompletion`: Content + finish_reason + usage tokens

### Validation Schemas (`schemas/llm.ts`, `lib/config-schemas.ts`)
- `validateChatRequest()`: Runtime validation for LLM chat requests
- Zod schemas for provider configs, system config, features, security, database settings
- Default model lists and rate limits per provider

## Testing Strategy

### Test Configuration (`vitest.config.ts`)
- Environment: jsdom
- Setup: `test/setup.tsx` (mocks for fetch, Next.js router, NextAuth, localStorage, ThemeProvider)
- Pool: `forks` in CI, `threads` otherwise
- Coverage: v8 provider with text/json/html reporters

### Test Utilities (`test/test-utils.tsx`)
- `customRender()`: Wraps components with SessionProvider + ThemeProvider + optional ErrorBoundary
- `createMockFetch()`: Mock fetch with URL pattern matching (exact + regex)
- `createMockStreamingResponse()`: NDJSON stream simulator
- `createMockPrisma()`: Full Prisma client mock
- Mock data: sessions, provider configs, conversations, personas

### E2E Tests (`playwright.config.ts`)
- Browsers: Chromium, Firefox, WebKit, Mobile Chrome (Pixel 5), Mobile Safari (iPhone 12)
- Screenshots on failure, video on first retry
- 30-second timeout, 2 retries in CI

### Test Files
Located in `test/` directory, covering:
- API routes: auth, config, conversations, goals, personas, health, LLM chat/stream, admin, subscriptions, webhooks
- Services: analytics, conversation-service, goal-service, persona-service
- Libraries: config-schemas, db-fallback, guest-migration, provider-key-test, runtime-secrets, stripe
- Middleware: auth routing

## Environment Setup

Copy `.env.example` to `.env.local` and configure:

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: NextAuth encryption key
- `NEXTAUTH_URL`: Application URL (e.g., `http://localhost:3000`)

### LLM Providers (at least one required)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`, `GROK_API_KEY`

### OAuth (optional)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

### Payments (optional)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`

### Security
- `API_KEY_ENCRYPTION_SEED`: Required in production for API key encryption

### Feature Flags
- `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN`: Enable strict auth (`true`/`false`)
- `NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH`: Skip auth in development
- `DEMO_ACCOUNT_ENABLED`: Enable demo credentials
- `REDIS_URL`: Enable Redis-backed caching and rate limiting

## Code Conventions

- **Components**: PascalCase files in `components/`, `'use client'` directive for client components
- **Hooks**: `use-*.ts` naming in `hooks/`, consistent fetch-on-mount + optimistic update pattern
- **Utilities**: kebab-case in `lib/` and `services/`
- **DB Services**: `*.db.ts` suffix for Prisma-backed services with fallback pattern
- **Tests**: `*.test.tsx|ts` files in `test/` directory
- **Types**: Centralized in `types/` directory, Prisma types in `types/prisma.ts`
- **Schemas**: Zod validation in `lib/config-schemas.ts`, manual validation in `schemas/llm.ts`
- **TypeScript**: Strict mode, ES2020 target, bundler module resolution, `@/*` path alias
- **Styling**: Tailwind CSS with HSL CSS variables, `cn()` utility (clsx + tailwind-merge), CVA for component variants
- **Error Handling**: Typed error classes from `lib/error-system.ts`, toast notifications for user-facing errors
- **State**: React hooks (no Redux/Zustand), global toast via reducer, session via NextAuth context

## Deployment

### Vercel (`vercel.json`)
- Framework: nextjs
- API headers: `Cache-Control: no-store, must-revalidate`
- Build command: `npm run build` (includes `prisma generate`)

### PM2 (`ecosystem.config.js`)
- Used for Python FastAPI orchestration service
- Localhost binding at port 8008

## Known Architecture Notes

- **Python Core**: `src/core/llm_manager` exists but routes through PM2 proxy at `127.0.0.1:8008`. Fallback to local Node.js orchestration when unavailable.
- **Dual Storage Pattern**: All DB services implement in-memory fallback with `lib/db-fallback.ts` for resilience when PostgreSQL is unavailable.
- **Streaming**: NDJSON format (primary) with `chunk`/`done`/`error`/`aborted` event types, plus SSE/plain text fallback.
- **Security**: AES-256-GCM encryption for API keys at rest, server-side proxy pattern for LLM calls.
- **Client Storage**: IndexedDB (via `idb` library) for offline conversation storage, localStorage for settings and preferences.
- **Goal Metadata**: Subtasks and due dates encoded as JSON in HTML comments within the goal description field.
- **Provider Health**: `components/api-key-form.tsx` tests saved keys via `/api/test-api-key` with format validation + HTTP connectivity check.
