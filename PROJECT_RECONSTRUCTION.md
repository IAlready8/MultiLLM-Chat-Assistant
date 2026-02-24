# Project Reconstruction Document
## MultiLLM Chat Assistant - Complete Technical Blueprint

**Document Version**: 1.0
**Date**: February 24, 2026
**Purpose**: Complete project documentation sufficient for full system reconstruction from scratch

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack & Dependencies](#technology-stack--dependencies)
4. [Database Schema & Data Model](#database-schema--data-model)
5. [Application Structure](#application-structure)
6. [Core Features & Implementation](#core-features--implementation)
7. [API Reference](#api-reference)
8. [Authentication & Security](#authentication--security)
9. [Configuration & Environment](#configuration--environment)
10. [Build & Deployment](#build--deployment)
11. [Testing Strategy](#testing-strategy)
12. [Development Workflow](#development-workflow)
13. [Known Constraints & Design Decisions](#known-constraints--design-decisions)

---

## Executive Summary

### What This Is
The MultiLLM Chat Assistant is a production-ready Next.js 16 web application that provides a unified interface for interacting with multiple Large Language Model (LLM) providers. It supports real-time streaming conversations, custom AI personas, analytics tracking, goal management, and multi-model comparison workflows.

### Core Value Proposition
- **Multi-Provider Support**: Single interface for OpenAI, Anthropic, Google AI, OpenRouter, and Grok
- **Flexible Authentication**: Guest mode for local development, strict auth for production
- **Resilient Architecture**: Database-first with intelligent fallbacks to in-memory storage
- **Production-Ready**: Comprehensive testing, CI/CD, security hardening, and deployment automation

### Primary Use Cases
1. Developers evaluating multiple LLM providers for specific tasks
2. Teams needing secure, self-hosted LLM access with usage tracking
3. Organizations requiring custom AI personas and workflow automation
4. Researchers comparing model responses side-by-side

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Browser                           │
│  (React 18 + Next.js 16 App Router + Tailwind CSS)         │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js Application Server                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend Layer (React Components)                   │  │
│  │  - Multi-chat interface                              │  │
│  │  - Analytics dashboard                               │  │
│  │  - Settings & configuration                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  API Routes (/app/api/*)                             │  │
│  │  - Authentication endpoints                          │  │
│  │  - LLM proxy/streaming                               │  │
│  │  - CRUD operations (conversations, goals, personas)  │  │
│  │  - Admin & analytics endpoints                       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Business Logic Layer (services/*)                   │  │
│  │  - Conversation service                              │  │
│  │  - Persona service                                   │  │
│  │  - Goal service                                      │  │
│  │  - Analytics service                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Data Layer (lib/*)                                  │  │
│  │  - Prisma ORM client                                 │  │
│  │  - DB fallback manager                               │  │
│  │  - Secure storage                                    │  │
│  │  - API key encryption                                │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────┬───────────────────┬───────────────────────────┘
              │                   │
              │                   │
              ▼                   ▼
┌──────────────────────┐  ┌──────────────────────────────────┐
│   PostgreSQL DB      │  │   LLM Provider APIs              │
│   (Prisma ORM)       │  │   - OpenAI                       │
│   - User data        │  │   - Anthropic (Claude)           │
│   - Conversations    │  │   - Google AI (Gemini)           │
│   - API configs      │  │   - OpenRouter                   │
│   - Analytics        │  │   - Grok                         │
│   (w/ fallback to    │  └──────────────────────────────────┘
│    in-memory store)  │
└──────────────────────┘

Optional Components:
┌──────────────────────┐  ┌──────────────────────────────────┐
│  Redis Cache         │  │  Python FastAPI Sidecar          │
│  (optional)          │  │  (optional orchestration)        │
└──────────────────────┘  └──────────────────────────────────┘
```

### Request Flow

**Standard Chat Request:**
1. User sends message via `/multi-chat` UI
2. React component calls `POST /api/llm/stream`
3. API route validates session (NextAuth.js)
4. Route retrieves provider config (encrypted API keys)
5. Provider adapter (e.g., `lib/providers/openai.ts`) makes external API call
6. Response streams back as NDJSON chunks
7. React component displays tokens in real-time
8. Conversation saved to DB (or in-memory fallback)

**Authentication Flow:**
1. User visits protected route
2. Middleware checks NextAuth session
3. If no session and `AUTH_REQUIRE_LOGIN=false`, allow as guest
4. If no session and `AUTH_REQUIRE_LOGIN=true`, redirect to `/auth/signin`
5. OAuth or credential login via NextAuth.js
6. Session stored in DB or JWT
7. Subsequent requests authenticated via session cookie

### Directory Structure

```
MultiLLM-Chat-Assistant/
├── app/                      # Next.js App Router
│   ├── api/                  # API route handlers
│   │   ├── auth/             # NextAuth + guest upgrade
│   │   ├── llm/              # LLM chat, streaming, orchestration
│   │   ├── conversations/    # CRUD for conversations
│   │   ├── goals/            # Goal tracking endpoints
│   │   ├── personas/         # Persona management
│   │   ├── admin/            # Admin dashboard APIs
│   │   ├── analytics/        # Analytics recording
│   │   ├── subscriptions/    # Stripe billing
│   │   └── webhooks/         # Stripe webhooks
│   ├── multi-chat/           # Main chat interface
│   ├── analytics/            # Analytics dashboard
│   ├── personas/             # Persona management UI
│   ├── goal-hub/             # Goal tracking UI
│   ├── comparison/           # Multi-model comparison
│   ├── pipeline/             # Workflow builder
│   ├── ai-roundtable/        # Multi-AI discussion
│   ├── settings/             # User settings
│   ├── billing/              # Subscription management
│   ├── admin/                # Admin dashboards
│   ├── auth/                 # Auth pages
│   └── layout.tsx            # Root layout with providers
│
├── components/               # React components
│   ├── ui/                   # Radix UI primitives
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── card.tsx
│   │   └── ...               # 20+ UI primitives
│   ├── persona-manager.tsx   # Feature components
│   ├── conversation-manager.tsx
│   ├── api-key-form.tsx
│   └── ...
│
├── lib/                      # Shared utilities
│   ├── auth.ts               # NextAuth configuration
│   ├── api-auth.ts           # API authentication helpers
│   ├── prisma.ts             # Prisma client singleton
│   ├── db-fallback.ts        # Fallback storage manager
│   ├── api-key-service.ts    # Encrypted key storage
│   ├── secure-storage.ts     # Client-side encryption
│   ├── providers/            # LLM provider adapters
│   │   ├── registry.ts       # Provider registry
│   │   ├── openai.ts
│   │   ├── anthropic.ts
│   │   ├── google.ts
│   │   ├── openrouter.ts
│   │   ├── grok.ts
│   │   └── errors.ts         # Error classification
│   └── ...                   # 40+ utility modules
│
├── services/                 # Business logic
│   ├── conversation-service.db.ts
│   ├── persona-service.db.ts
│   ├── goal-service.db.ts
│   ├── analytics-service.ts
│   └── ...
│
├── prisma/                   # Database
│   ├── schema.prisma         # Data model
│   └── migrations/           # Migration history
│       └── 20260117134259_init/
│
├── test/                     # Test files
│   ├── *.test.ts             # 28 test suites, 191 tests
│   └── setup.tsx             # Test environment setup
│
├── tests/                    # Python tests (optional)
│   └── test_*.py
│
├── src/core/                 # Python sidecar (optional)
│   ├── llm_manager.py
│   └── ...
│
├── scripts/                  # Deployment & verification
│   ├── smoke-test.sh
│   ├── verify-production.sh
│   ├── enforce-branch-protection.sh
│   └── next-upgrade-readiness.sh
│
├── docs/                     # Additional documentation
│   └── DEPLOYMENT_GUIDE.md
│
├── hooks/                    # Custom React hooks
│   ├── use-conversation.ts
│   ├── use-goals.ts
│   └── use-personas.ts
│
├── schemas/                  # Zod validation schemas
│   └── config.ts
│
├── types/                    # TypeScript type definitions
│   └── *.ts
│
├── public/                   # Static assets
│
├── .github/workflows/        # CI/CD
│   └── ci.yml
│
├── Configuration files:
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── vitest.config.ts
│   ├── eslint.config.mjs
│   ├── playwright.config.ts
│   ├── vercel.json
│   ├── package.json
│   └── .env.example
│
└── Documentation:
    ├── README.md
    ├── ARCHITECTURE.md
    ├── DESIGN_SYSTEM.md
    ├── DOCUMENTATION.md
    ├── ROADMAP.md
    ├── STATUS_UPDATE.md
    ├── CLAUDE.md
    └── ...
```

---

## Technology Stack & Dependencies

### Core Runtime (Production Dependencies)

**Framework & Runtime:**
- **Next.js**: 16.1.1 (App Router, React Server Components, API Routes)
- **React**: 18.x (UI library)
- **Node.js**: 20+ (runtime requirement)
- **TypeScript**: 5.x (strict mode enabled)

**Database & ORM:**
- **Prisma**: 7.3.0 (ORM and schema management)
- **@prisma/client**: 7.3.0 (generated database client)
- **@prisma/adapter-pg**: 7.3.0 (PostgreSQL adapter)
- **pg**: 8.16.3 (PostgreSQL driver)

**Authentication:**
- **next-auth**: 4.24.7 (authentication framework)
- **@next-auth/prisma-adapter**: 1.0.7 (database adapter)
- **bcryptjs**: 3.0.2 (password hashing)

**UI & Styling:**
- **tailwindcss**: 3.3.0 (utility-first CSS)
- **Radix UI**: Component primitives (10+ packages)
  - @radix-ui/react-dialog
  - @radix-ui/react-dropdown-menu
  - @radix-ui/react-tabs
  - @radix-ui/react-toast
  - (and more)
- **class-variance-authority**: 0.7.0 (CVA for component variants)
- **clsx**: 2.1.0 (className utilities)
- **tailwind-merge**: 2.2.1 (Tailwind class merging)
- **tailwindcss-animate**: 1.0.7 (animation utilities)
- **framer-motion**: 12.29.2 (animations)
- **lucide-react**: 0.354.0 (icon library)
- **next-themes**: 0.2.1 (theme management)

**Data Visualization:**
- **recharts**: 2.15.4 (analytics charts)

**Client-Side Storage:**
- **idb**: 8.0.0 (IndexedDB wrapper)

**Validation:**
- **zod**: 4.1.3 (schema validation)

**Utilities:**
- **uuid**: 11.1.0 (unique ID generation)

**Optional Production Dependencies:**
- **redis**: 5.8.2 (caching, optional)
- **stripe**: 20.0.0 (billing integration, optional)

### Development Dependencies

**Testing:**
- **vitest**: 3.2.4 (test runner)
- **@testing-library/react**: 16.3.0 (React testing utilities)
- **@testing-library/jest-dom**: 6.6.4 (DOM matchers)
- **@testing-library/user-event**: 14.6.1 (user interaction simulation)
- **@playwright/test**: 1.55.0 (E2E testing)
- **jsdom**: 26.1.0 (DOM environment for tests)

**Build Tools:**
- **autoprefixer**: 10.0.1 (CSS vendor prefixing)
- **postcss**: 8.x (CSS processing)
- **@vitejs/plugin-react**: 4.7.0 (Vite React support)

**Type Definitions:**
- **@types/node**: 20.19.11
- **@types/react**: 18.x
- **@types/react-dom**: 18.x
- **@types/uuid**: 10.0.0
- **@types/pg**: 8.15.5
- **@types/bcryptjs**: 2.4.6

**Code Quality:**
- **eslint**: 9.x (flat config)
- **eslint-config-next**: 16.1.1 (Next.js ESLint rules)

**Deployment:**
- **vercel**: 50.9.6 (Vercel CLI)
- **dotenv**: 17.2.3 (environment variable loading)

### Package Scripts

```json
{
  "dev": "next dev --webpack",
  "build": "prisma generate && next build --webpack",
  "postinstall": "prisma generate",
  "start": "next start",
  "lint": "eslint . --max-warnings=0",
  "test": "vitest --passWithNoTests",
  "test:run": "vitest run --passWithNoTests",
  "test:run:local": "vitest run --pool=threads --max-workers=1",
  "test:coverage": "vitest run --coverage --passWithNoTests",
  "type-check": "tsc -p . --noEmit",
  "smoke": "bash scripts/smoke-test.sh",
  "verify:prod": "bash scripts/verify-production.sh",
  "protect:main": "bash scripts/enforce-branch-protection.sh",
  "upgrade:next:prep": "bash scripts/next-upgrade-readiness.sh"
}
```

---

## Database Schema & Data Model

### Schema Overview (Prisma)

The application uses PostgreSQL via Prisma ORM with the following models:

#### Authentication Models (NextAuth.js standard)

**User**
```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  accounts      Account[]
  sessions      Session[]
  conversations Conversation[]
  providerConfigs ProviderConfig[]
  goals         Goal[]
  personas      Persona[]
  analytics     Analytics[]
  subscriptions Subscription[]
  teamMemberships TeamMember[]
}
```

**Account** (OAuth provider data)
```prisma
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}
```

**Session**
```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**VerificationToken**
```prisma
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

#### Core Domain Models

**Conversation**
```prisma
model Conversation {
  id        String   @id @default(cuid())
  userId    String
  title     String?
  provider  String?
  model     String?
  messages  Json     @default("[]")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

**ProviderConfig** (Encrypted API keys)
```prisma
model ProviderConfig {
  id           String   @id @default(cuid())
  userId       String
  provider     String
  encryptedKey String
  settings     Json     @default("{}")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, provider])
  @@index([userId])
}
```

**Goal**
```prisma
model Goal {
  id          String   @id @default(cuid())
  userId      String
  title       String
  description String?
  status      String   @default("pending")
  targetDate  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

**Persona**
```prisma
model Persona {
  id          String   @id @default(cuid())
  userId      String
  name        String
  systemPrompt String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

**Analytics**
```prisma
model Analytics {
  id          String   @id @default(cuid())
  userId      String
  eventType   String
  provider    String?
  model       String?
  tokenCount  Int?
  responseTime Int?
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, eventType])
  @@index([createdAt])
}
```

#### Team & Subscription Models

**Team**
```prisma
model Team {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members      TeamMember[]
  subscriptions Subscription[]
}
```

**TeamMember**
```prisma
model TeamMember {
  id        String   @id @default(cuid())
  teamId    String
  userId    String
  role      String   @default("member")
  createdAt DateTime @default(now())

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([teamId, userId])
}
```

**Subscription**
```prisma
model Subscription {
  id                String   @id @default(cuid())
  userId            String?
  teamId            String?
  stripeCustomerId  String?  @unique
  stripeSubscriptionId String? @unique
  stripePriceId     String?
  tier              String   @default("FREE")
  status            String   @default("active")
  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)
  team Team? @relation(fields: [teamId], references: [id], onDelete: Cascade)
}
```

### Migration History

**Single initialization migration:** `20260117134259_init`

This migration creates all tables with proper indexes, relationships, and cascade delete rules.

### Database Fallback Strategy

The application implements intelligent database fallback:

1. **Primary Path**: Prisma client connects to PostgreSQL via `DATABASE_URL`
2. **Detection**: Failed operations trigger fallback detection
3. **Retry Logic**: Temporary failures (connection timeouts) trigger retry-after intervals
4. **Fallback Storage**: Permanent failures use in-memory Map-based storage
5. **Capacity Limits**: In-memory stores capped at 1000 user-scoped entries
6. **Warning System**: Single warning logged per scope to avoid log spam

**Implementation**: `lib/db-fallback.ts` provides centralized fallback management

---

## Application Structure

### Page Routes (16 total)

| Route | Purpose | Auth Required |
|-------|---------|---------------|
| `/` | Landing page / dashboard | Optional |
| `/multi-chat` | Main chat interface | Optional |
| `/analytics` | Usage analytics dashboard | Optional |
| `/personas` | Persona management | Optional |
| `/goal-hub` | Goal tracking | Optional |
| `/pipeline` | Workflow builder | Optional |
| `/comparison` | Multi-model comparison | Optional |
| `/ai-roundtable` | AI discussion interface | Optional |
| `/settings` | User settings & API keys | Optional |
| `/billing` | Subscription management | Optional |
| `/admin/status` | System status monitoring | Admin |
| `/admin/errors` | Error tracking dashboard | Admin |
| `/auth/signin` | Sign-in page | Public |
| `/auth/signout` | Sign-out confirmation | Public |
| `/auth/error` | Authentication error page | Public |
| `/api-test` | API key testing utility | Optional |

Auth depends on `AUTH_REQUIRE_LOGIN` environment variable.

### Component Architecture

**UI Primitives** (`components/ui/`):
- Built on Radix UI components
- Styled with Tailwind CSS
- Variants managed via CVA (class-variance-authority)
- Examples: Button, Dialog, Card, Input, Tabs, Toast

**Feature Components** (`components/`):
- `PersonaManager`: Create, edit, delete personas
- `ConversationManager`: Save, load, export conversations
- `ApiKeyForm`: Configure LLM provider API keys
- `AuthProvider`: Session context provider
- `AuthGuard`: Protected route wrapper
- `Navbar`: Navigation with user menu
- `ErrorBoundary`: React error handling
- `ThemeProvider`: Dark/light mode management

### Custom Hooks (`hooks/`)

- `use-conversation.ts`: Conversation state management
- `use-goals.ts`: Goal CRUD operations
- `use-personas.ts`: Persona management
- `use-toast.ts`: Toast notification system

---

## Core Features & Implementation

### 1. Multi-LLM Chat Interface

**Location**: `/app/multi-chat/page.tsx`

**Capabilities:**
- Real-time streaming responses from 5 LLM providers
- Provider/model switching mid-conversation
- Message history with provider attribution
- Token usage tracking per message
- Conversation save/load/export

**Streaming Protocol:**
```typescript
// NDJSON format
{ "type": "chunk", "content": "Hello" }
{ "type": "chunk", "content": " world" }
{ "type": "done", "usage": { "tokens": 42 } }
{ "type": "error", "message": "Rate limit exceeded" }
{ "type": "aborted", "reason": "User cancelled" }
```

**Provider Adapters:**
- `lib/providers/openai.ts`: OpenAI (GPT-4, GPT-4 Turbo, GPT-4o, GPT-3.5-turbo)
- `lib/providers/anthropic.ts`: Anthropic (Claude 3 Opus/Sonnet/Haiku, Claude 3.5 Sonnet)
- `lib/providers/google.ts`: Google AI (Gemini 1.5 Pro/Flash, Gemini Pro)
- `lib/providers/openrouter.ts`: OpenRouter (aggregator + free models)
- `lib/providers/grok.ts`: Grok (beta)

**Error Handling:**
- Rate limit detection with retry-after
- Authentication errors
- Token limit exceeded
- Network failures
- Provider-specific error classification (`lib/providers/errors.ts`)

### 2. Custom AI Personas

**Location**: `/app/personas/page.tsx`

**Features:**
- Create personas with custom system prompts
- Per-user persona storage
- Apply personas to conversations
- Default personas provided by system
- Persona descriptions for easy selection

**Storage:**
- Primary: `Persona` table in PostgreSQL
- Fallback: In-memory Map per user
- Service: `services/persona-service.db.ts`

### 3. Analytics & Monitoring

**Location**: `/app/analytics/page.tsx`

**Tracked Metrics:**
- Event types: chat_completion, llm_error, goal_created, etc.
- Provider and model usage
- Token consumption per request
- Response time per request
- Error rates by provider
- Time-series visualization (Recharts)

**Admin Dashboard** (`/app/admin/status/page.tsx`):
- System health checks
- Database connectivity status
- Authentication configuration
- Fallback storage status
- Recent errors with severity

**Error Statistics** (`/app/admin/errors/page.tsx`):
- Error counts by type
- Critical vs. warning categorization
- Time-range filtering

### 4. Goal Tracking

**Location**: `/app/goal-hub/page.tsx`

**Capabilities:**
- Create goals with descriptions and target dates
- Status tracking (pending, in-progress, completed)
- Goal updates and deletion
- Per-user goal isolation

**Storage:**
- Primary: `Goal` table
- Fallback: In-memory Map
- Service: `services/goal-service.db.ts`

### 5. Multi-Model Comparison

**Location**: `/app/comparison/page.tsx`

**Features:**
- Send identical prompts to multiple models simultaneously
- Side-by-side response display
- Compare response times and token usage
- Export comparison results

### 6. AI Roundtable

**Location**: `/app/ai-roundtable/page.tsx`

**Implementation:**
- Sequential or parallel multi-model conversation
- Each model responds to the same prompt
- Aggregate responses for analysis

### 7. Pipeline/Workflow Builder

**Location**: `/app/pipeline/page.tsx`

**Capabilities:**
- Multi-step LLM workflows
- Conditional routing based on responses
- Optional Python sidecar for advanced orchestration
- Fallback to local orchestration if sidecar unavailable

**Python Sidecar** (`src/core/`):
- FastAPI application
- Advanced workflow management
- Proxied via `/api/llm/orchestrate`

### 8. Billing & Subscriptions

**Location**: `/app/billing/page.tsx`

**Features:**
- Stripe integration for payments
- Subscription tiers: FREE, PAID, ENTERPRISE
- Usage-based billing tracking
- Webhook handling for Stripe events (`/api/webhooks/stripe`)

**Subscription Service:**
- `services/subscription-service.ts`
- Stripe customer creation
- Subscription lifecycle management

### 9. Settings & API Key Management

**Location**: `/app/settings/page.tsx`

**Features:**
- Configure API keys for all 5 providers
- Test API keys before saving
- Secure encryption with AES-GCM
- Per-user provider configurations
- Settings persistence

**Encryption:**
- Derives encryption key from `API_KEY_ENCRYPTION_SEED`
- Uses AES-GCM authenticated encryption
- Keys never logged or exposed in frontend
- Implementation: `lib/api-key-service.ts`

---

## API Reference

### Authentication Endpoints

#### `POST /api/auth/[...nextauth]`
NextAuth.js dynamic routes for OAuth and credential authentication.

**Providers Configured:**
- Google OAuth
- GitHub OAuth
- Credentials (email/password)

#### `POST /api/auth/upgrade-guest`
Convert guest session to authenticated account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "clu1234567890"
}
```

### LLM Endpoints

#### `POST /api/llm/chat`
Single-turn chat completion (non-streaming).

**Request:**
```json
{
  "provider": "openai",
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}
```

**Response:**
```json
{
  "content": "Hello! How can I help you today?",
  "usage": { "tokens": 42 }
}
```

#### `POST /api/llm/stream`
Streaming chat completion (NDJSON).

**Request:** Same as `/api/llm/chat`

**Response:** NDJSON stream
```
{"type":"chunk","content":"Hello"}
{"type":"chunk","content":"!"}
{"type":"done","usage":{"tokens":42}}
```

#### `POST /api/llm/orchestrate`
Multi-step workflow orchestration (proxies to Python sidecar).

**Request:**
```json
{
  "workflow": "multi_step",
  "steps": [
    { "provider": "openai", "model": "gpt-4", "prompt": "Step 1" },
    { "provider": "anthropic", "model": "claude-3-opus", "prompt": "Step 2" }
  ]
}
```

**Response:**
```json
{
  "results": [
    { "step": 1, "content": "..." },
    { "step": 2, "content": "..." }
  ]
}
```

### Conversation Endpoints

#### `GET /api/conversations`
List user's conversations.

**Query Params:**
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset

**Response:**
```json
{
  "conversations": [
    {
      "id": "conv_123",
      "title": "Discussion about AI",
      "provider": "openai",
      "model": "gpt-4",
      "createdAt": "2026-02-24T12:00:00Z"
    }
  ]
}
```

#### `POST /api/conversations`
Create new conversation.

**Request:**
```json
{
  "title": "New Chat",
  "provider": "anthropic",
  "model": "claude-3-sonnet"
}
```

#### `GET /api/conversations/[id]`
Get conversation details with full message history.

#### `PUT /api/conversations/[id]`
Update conversation (title, messages).

**Request:**
```json
{
  "title": "Updated Title",
  "messages": [...]
}
```

#### `DELETE /api/conversations/[id]`
Delete conversation.

### Provider Configuration Endpoints

#### `GET /api/provider-configs`
List user's provider configurations.

**Response:**
```json
{
  "configs": [
    {
      "provider": "openai",
      "hasKey": true,
      "settings": { "temperature": 0.7 }
    }
  ]
}
```

#### `POST /api/provider-configs`
Add or update provider configuration.

**Request:**
```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "settings": { "temperature": 0.7 }
}
```

#### `DELETE /api/provider-configs`
Remove provider configuration.

**Request:**
```json
{
  "provider": "openai"
}
```

### Goal Endpoints

#### `GET /api/goals`
List user goals.

#### `POST /api/goals`
Create goal.

**Request:**
```json
{
  "title": "Complete project documentation",
  "description": "Create comprehensive docs",
  "targetDate": "2026-03-01",
  "status": "pending"
}
```

#### `PUT /api/goals/[id]`
Update goal.

#### `DELETE /api/goals/[id]`
Delete goal.

### Persona Endpoints

#### `GET /api/personas`
List personas (system + user-created).

#### `POST /api/personas`
Create persona.

**Request:**
```json
{
  "name": "Code Reviewer",
  "systemPrompt": "You are an expert code reviewer...",
  "description": "Reviews code for best practices"
}
```

#### `PUT /api/personas/[id]`
Update persona.

#### `DELETE /api/personas/[id]`
Delete persona.

### Analytics Endpoints

#### `POST /api/analytics`
Record analytics event.

**Request:**
```json
{
  "eventType": "chat_completion",
  "provider": "openai",
  "model": "gpt-4",
  "tokenCount": 150,
  "responseTime": 2500,
  "metadata": {}
}
```

### Admin Endpoints

#### `GET /api/admin/status`
System health status.

**Response:**
```json
{
  "ok": true,
  "checks": {
    "database": { "ok": true },
    "auth": { "ok": true, "mode": "strict" },
    "fallbackActive": false
  }
}
```

#### `POST /api/admin/errors/stats`
Error statistics.

**Request:**
```json
{
  "from": "2026-02-01T00:00:00Z",
  "to": "2026-02-24T23:59:59Z"
}
```

**Response:**
```json
{
  "total": 42,
  "bySeverity": {
    "critical": 5,
    "warning": 37
  },
  "byType": {
    "rate_limit": 20,
    "auth_error": 15,
    "network_error": 7
  }
}
```

### Other Endpoints

#### `GET /api/config`
App configuration (available providers, models, limits).

#### `POST /api/test-api-key`
Validate API key for a provider.

**Request:**
```json
{
  "provider": "openai",
  "apiKey": "sk-..."
}
```

**Response:**
```json
{
  "valid": true,
  "message": "API key is valid"
}
```

#### `GET /api/health`
Simple health check.

**Response:**
```json
{ "status": "ok" }
```

---

## Authentication & Security

### Authentication Modes

**Guest Mode** (`AUTH_REQUIRE_LOGIN=false`):
- No login required for app access
- Guest user ID auto-assigned
- API keys stored locally with encryption
- Conversation data persists in-memory or DB if configured
- Allows upgrade to authenticated account

**Strict Auth Mode** (`AUTH_REQUIRE_LOGIN=true`):
- Requires valid session for all protected routes
- OAuth or credential-based login
- Session stored in database or JWT
- API keys encrypted server-side
- All data persisted with user association

### NextAuth.js Configuration

**File**: `lib/auth.ts`

**Providers:**
```typescript
[
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
  GitHubProvider({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }),
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { type: 'email' },
      password: { type: 'password' }
    },
    authorize: async (credentials) => {
      // Password verification with bcrypt
    }
  })
]
```

**Session Strategy:**
- Database sessions when `DATABASE_URL` configured
- JWT sessions as fallback

### API Key Encryption

**Algorithm**: AES-GCM (authenticated encryption)

**Process:**
1. Derive encryption key from `API_KEY_ENCRYPTION_SEED` using PBKDF2
2. Generate random IV (initialization vector) per encryption
3. Encrypt API key with AES-GCM
4. Store IV + ciphertext in database
5. Decrypt on retrieval with same derived key

**Implementation**: `lib/api-key-service.ts`

**Storage**: `ProviderConfig.encryptedKey` field (TEXT column)

### Client-Side Secure Storage

**File**: `lib/secure-storage.ts`

**Features:**
- Encrypts data before storing in localStorage
- Uses runtime-generated key or `NEXT_PUBLIC_SECURE_STORAGE_KEY`
- Guards against server-side access (localStorage unavailable)
- Automatic JSON serialization

**Usage:**
```typescript
import SecureStorage from '@/lib/secure-storage';

SecureStorage.setItem('apiKey', 'sk-...');
const key = SecureStorage.getItem('apiKey');
```

### Rate Limiting

**Configuration** (via environment variables):
- `RATE_LIMIT_LLM_PER_USER`: Max requests per user per window
- `RATE_LIMIT_LLM_GLOBAL`: Max total requests per window
- `RATE_LIMIT_LLM_WINDOW_MS`: Time window in milliseconds

**Implementation**: In-memory Map-based rate limiting per provider

### Circuit Breaker

**Purpose**: Prevent cascading failures to external LLM APIs

**Configuration**:
- `CIRCUIT_BREAKER_THRESHOLD`: Failures before opening circuit
- `CIRCUIT_BREAKER_TIMEOUT_MS`: Circuit open duration
- `CIRCUIT_BREAKER_RESET_TIMEOUT_MS`: Time before attempting reset

**States**: Closed → Open → Half-Open → Closed

### Security Best Practices

1. **Never log API keys**: Redacted in all log outputs
2. **Server-side validation**: All API routes validate input with Zod
3. **HTTPS only**: Production deployments require HTTPS
4. **CORS**: Configured for same-origin by default
5. **Environment separation**: Different secrets per environment
6. **No credentials in code**: All secrets via environment variables
7. **Encrypted at rest**: API keys encrypted in database
8. **Session security**: HTTP-only cookies, secure flag in production

---

## Configuration & Environment

### Required Environment Variables

**Core Authentication:**
```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated-secret>  # Required when AUTH_REQUIRE_LOGIN=true
API_KEY_ENCRYPTION_SEED=<random-seed>  # REQUIRED for API key encryption
```

**Authentication Mode:**
```bash
AUTH_REQUIRE_LOGIN=false  # false = guest mode, true = strict auth
NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false  # Must match AUTH_REQUIRE_LOGIN
```

**Database:**
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
DB_CONNECTION_LIMIT=10
DB_POOL_TIMEOUT=30000
```

### Optional Environment Variables

**Demo/Guest Configuration:**
```bash
DEMO_ACCOUNT_ENABLED=true
DEMO_ACCOUNT_BYPASS_AUTH=true
DEMO_ACCOUNT_EMAIL=demo@example.com
DEMO_ACCOUNT_PASSWORD=demo123
DEMO_ACCOUNT_NAME=Demo User
DEMO_ACCOUNT_ID=demo-user-id
GUEST_USER_ID=guest-user
GUEST_USER_NAME=Guest
GUEST_USER_EMAIL=guest@localhost
```

**LLM Provider API Keys:**
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
GROK_API_KEY=grok-...
```

**OAuth Credentials:**
```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

**Caching (Optional):**
```bash
REDIS_URL=redis://localhost:6379
```

**Rate Limiting:**
```bash
RATE_LIMIT_LLM_PER_USER=100
RATE_LIMIT_LLM_GLOBAL=1000
RATE_LIMIT_LLM_WINDOW_MS=60000
```

**Circuit Breaker:**
```bash
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=60000
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

**Performance Monitoring:**
```bash
ENABLE_PERFORMANCE_MONITORING=true
METRICS_RETENTION_HOURS=168
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
```

**Python Sidecar (Optional):**
```bash
PYTHON_CORE_URL=http://127.0.0.1:8008
```

**Stripe (Optional):**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Client-Side (NEXT_PUBLIC_ prefix):**
```bash
NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false
NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH=true
NEXT_PUBLIC_SECURE_STORAGE_KEY=<test-only-key>
```

### Configuration Files

**next.config.mjs:**
```javascript
{
  webpack: (config) => {
    // Custom webpack config
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false
  },
  images: {
    domains: ['lh3.googleusercontent.com', 'avatars.githubusercontent.com']
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**tailwind.config.ts:**
- Design tokens for colors, spacing, typography
- Dark mode: `class` strategy
- Custom animations: rainbow-outline, fade-in, pulse
- Radix UI integration

**vitest.config.ts:**
```typescript
{
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.tsx'],
    coverage: {
      provider: 'v8',
      exclude: ['node_modules', 'test', '.d.ts', '*.config.*']
    },
    pool: 'forks'  // CI mode, 'threads' for local
  }
}
```

---

## Build & Deployment

### Local Development

**Prerequisites:**
- Node.js 20+
- npm
- PostgreSQL (optional, fallback available)
- Python 3.10+ (optional, for sidecar)

**Setup:**
```bash
# 1. Install dependencies
npm ci

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with required variables

# 3. Set minimum environment variables
export NEXTAUTH_URL=http://localhost:3000
export API_KEY_ENCRYPTION_SEED=$(openssl rand -hex 32)
export AUTH_REQUIRE_LOGIN=false
export NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false

# 4. (Optional) Setup database
# Configure DATABASE_URL in .env.local
npx prisma migrate deploy

# 5. Generate Prisma client
npx prisma generate

# 6. Start development server
npm run dev
```

**Access**: http://localhost:3000

### Production Build

**Build Steps:**
```bash
# 1. Install dependencies
npm ci

# 2. Set production environment variables
export NEXTAUTH_URL=https://yourdomain.com
export NEXTAUTH_SECRET=$(openssl rand -hex 32)
export API_KEY_ENCRYPTION_SEED=$(openssl rand -hex 32)
export AUTH_REQUIRE_LOGIN=true
export NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true
export DATABASE_URL=postgresql://...

# 3. Generate Prisma client
npx prisma generate

# 4. Run database migrations
npx prisma migrate deploy

# 5. Build application
npm run build

# 6. Start production server
npm start
```

**Build Output:**
- `.next/` directory with optimized production assets
- Server-side rendered pages
- API route handlers
- Static assets

### Vercel Deployment

**Method 1: Git Integration (Recommended)**

1. Connect GitHub repository to Vercel project
2. Set `Production Branch` to `main`
3. Configure environment variables in Vercel dashboard:
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - `API_KEY_ENCRYPTION_SEED`
   - `DATABASE_URL`
   - Add all LLM provider keys
   - Add OAuth credentials
4. Every push to `main` triggers automatic deployment

**Method 2: CLI Deployment**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy preview
vercel deploy -y

# Deploy to production
vercel deploy --prod -y

# With environment overrides (if secrets not configured)
vercel deploy -y \
  -b NEXTAUTH_SECRET=... \
  -b NEXTAUTH_URL=... \
  -b API_KEY_ENCRYPTION_SEED=... \
  -b DATABASE_URL=... \
  -e NEXTAUTH_SECRET=... \
  -e NEXTAUTH_URL=... \
  -e API_KEY_ENCRYPTION_SEED=... \
  -e DATABASE_URL=...
```

**Vercel Configuration** (`vercel.json`):
```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm ci",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NEXTAUTH_SECRET": "@nextauth_secret",
    "DATABASE_URL": "@database_url"
  }
}
```

### Production Verification

**Script**: `scripts/verify-production.sh`

**Usage:**
```bash
# Basic verification
npm run verify:prod -- --base-url https://yourdomain.com

# With database migration check
npm run verify:prod -- --base-url https://yourdomain.com --apply-migrations

# With Stripe webhook validation
npm run verify:prod -- --base-url https://yourdomain.com --check-webhook --require-stripe
```

**Checks:**
- Environment variables configured
- Database connectivity
- Migration status
- Health endpoint (`/api/health`)
- Authentication configuration
- Optional: Stripe webhook endpoint
- Optional: API endpoint smoke tests

### CI/CD Pipeline

**Workflow**: `.github/workflows/ci.yml`

**Jobs:**

1. **Quality Checks**
   - Install dependencies
   - Generate Prisma client
   - Run `npm run type-check`
   - Run `npm run lint`
   - Run `npm run test:run`
   - Run `npm run build`

2. **Smoke Tests**
   - Start PostgreSQL service container
   - Apply database migrations
   - Start production server
   - Execute smoke test suite (`npm run smoke`)

3. **Security Audit** (non-blocking)
   - Run `npm audit`
   - Report vulnerabilities

**Branch Protection:**
```bash
# Enforce required checks on main branch
npm run protect:main
```

Required status checks:
- `Quality Checks`
- `Smoke Tests`

### Database Migrations

**Development:**
```bash
# Create migration after schema changes
npx prisma migrate dev --name description_of_change

# Reset database (DESTRUCTIVE)
npx prisma migrate reset
```

**Production:**
```bash
# Apply pending migrations
npx prisma migrate deploy

# Check migration status
npx prisma migrate status
```

### Environment-Specific Configurations

**Development:**
- `AUTH_REQUIRE_LOGIN=false` (guest mode)
- Local PostgreSQL or in-memory fallback
- Console logs enabled
- Hot module replacement

**Staging:**
- `AUTH_REQUIRE_LOGIN=true`
- Staging database
- Console logs reduced
- Production build

**Production:**
- `AUTH_REQUIRE_LOGIN=true`
- Production database
- Console logs minimal (errors/warnings only)
- Optimized build with compression
- HTTPS required
- Session security hardened

---

## Testing Strategy

### Test Infrastructure

**Framework**: Vitest 3.2.4
**Environment**: jsdom (simulated browser)
**Testing Library**: React Testing Library 16.3.0
**E2E**: Playwright 1.55.0

**Configuration**: `vitest.config.ts`
```typescript
{
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.tsx'],
    globals: true,
    pool: 'forks',  // CI mode
    coverage: {
      provider: 'v8',
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.d.ts',
        '**/*.config.*',
        '.next/**',
        'prisma/**'
      ]
    }
  }
}
```

### Test Suite Overview

**Total**: 28 test files, 191 tests

**Categories:**

1. **Unit Tests** (Services & Utilities):
   - `analytics-service.test.ts`
   - `conversation-service-db.test.ts`
   - `goal-service-db.test.ts`
   - `persona-service-db.test.ts`
   - `db-fallback.test.ts`
   - `api-key-service.test.ts`
   - `stripe-lib.test.ts`
   - `config-schemas.test.ts`
   - `runtime-secrets.test.ts`
   - `provider-key-test.test.ts`
   - `provider-runtime.test.ts`

2. **API Route Tests**:
   - `api-auth.test.ts`
   - `api-llm-chat-route.test.ts`
   - `api-llm-stream-route.test.ts`
   - `api-conversations-routes.test.ts`
   - `api-goals-routes.test.ts`
   - `api-personas-routes.test.ts`
   - `api-provider-configs-route.test.ts`
   - `api-analytics-route.test.ts`
   - `api-subscriptions-routes.test.ts`
   - `api-config-route.test.ts`
   - `api-test-api-key-route.test.ts`
   - `api-health-route.test.ts`
   - `api-admin-status-route.test.ts`
   - `api-admin-errors-stats-route.test.ts`
   - `api-stripe-webhook-route.test.ts`
   - `api-upgrade-guest-route.test.ts`

3. **Integration Tests**:
   - `middleware-auth-routing.test.ts`
   - `guest-migration.test.ts`

4. **E2E Tests** (Playwright):
   - `tests/auth-flow.spec.ts`
   - `tests/provider-configuration.spec.ts`

### Test Setup (`test/setup.tsx`)

**Mocks:**
- Next.js `next/navigation` (useRouter, usePathname, etc.)
- NextAuth.js session management
- localStorage with in-memory implementation
- Prisma client with mock database

**Global Utilities:**
- `vi` (Vitest globals)
- Custom matchers from `@testing-library/jest-dom`

### Running Tests

```bash
# Watch mode (development)
npm run test

# Single run (CI)
npm run test:run

# Single-threaded (sandboxed environments)
npm run test:run:local

# With coverage
npm run test:coverage

# E2E smoke tests
npm run smoke
```

### Example Test Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    render(<Component />);
    await fireEvent.click(screen.getByRole('button'));
    expect(mockFunction).toHaveBeenCalled();
  });
});
```

### Coverage Goals

- **Services**: 80%+ coverage
- **API Routes**: 90%+ coverage (critical paths)
- **Components**: 70%+ coverage
- **Utilities**: 85%+ coverage

**Current Status**: Comprehensive coverage across all critical paths

---

## Development Workflow

### Code Quality Gates

**Before Committing:**
```bash
npm run type-check  # TypeScript strict checks
npm run lint        # ESLint with max-warnings=0
npm run test:run    # Full test suite
```

**Pre-Push Validation:**
```bash
npm run build       # Ensure production build succeeds
npm run smoke       # Quick E2E validation
```

### Branch Strategy

**Main Branch**: `main`
- Protected with required status checks
- Only accepts PRs with passing CI
- Represents production-ready code

**Feature Branches**: `feature/description` or `username/description`
- Created from `main`
- Merged via PR with review

**Hotfix Branches**: `hotfix/description`
- Created from `main`
- Fast-tracked merge for critical fixes

### Code Conventions

**File Naming:**
- Components: `PascalCase.tsx` (e.g., `PersonaManager.tsx`)
- Hooks: `use-*.ts` (e.g., `use-conversation.ts`)
- Utilities: `kebab-case.ts` (e.g., `api-key-service.ts`)
- Tests: `*.test.ts(x)` (e.g., `api-auth.test.ts`)

**TypeScript:**
- Strict mode enabled
- Explicit types at module boundaries
- Avoid `any` type
- Use type inference where clear

**React:**
- Functional components with hooks
- Props interfaces defined per component
- Use TypeScript for prop validation

**Formatting:**
- Prettier: 2 spaces, single quotes, trailing commas
- Line length: ~80 characters
- No semicolons (ASI)

**Imports:**
- Absolute imports via `@/*` alias
- Group imports: external → internal → relative
- Sort imports alphabetically within groups

### Commit Messages

**Format**: Conventional Commits

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Build process or tooling changes
- `perf`: Performance improvements

**Examples:**
```
feat(api): add streaming support for Claude 3.5
fix(auth): resolve guest session persistence
docs(readme): update deployment instructions
chore(deps): upgrade Next.js to 16.1.1
```

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Implement Changes**
   - Write code following conventions
   - Add tests for new functionality
   - Update documentation if needed

3. **Validate Locally**
   ```bash
   npm run type-check
   npm run lint
   npm run test:run
   npm run build
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

5. **Push to Remote**
   ```bash
   git push origin feature/new-feature
   ```

6. **Create Pull Request**
   - Provide clear description
   - Link related issues
   - Request reviewers
   - Ensure CI passes

7. **Address Review Feedback**
   - Make requested changes
   - Push additional commits
   - Re-request review

8. **Merge**
   - Squash and merge (preferred)
   - Delete feature branch after merge

### Debugging Tips

**Next.js Server Issues:**
```bash
# Check environment variables
env | grep NEXT

# Clear Next.js cache
rm -rf .next
npm run build
```

**Database Issues:**
```bash
# Check migration status
npx prisma migrate status

# View database schema
npx prisma studio

# Reset database (DESTRUCTIVE)
npx prisma migrate reset
```

**Test Failures:**
```bash
# Run specific test file
npx vitest run test/api-auth.test.ts

# Debug with console logs
npx vitest run --reporter=verbose
```

**Build Errors:**
```bash
# Check TypeScript errors
npm run type-check

# Check for missing dependencies
npm ci

# Regenerate Prisma client
npx prisma generate
```

---

## Known Constraints & Design Decisions

### 1. Database Fallback Strategy

**Decision**: Primary DB with intelligent in-memory fallback

**Rationale:**
- Allows app to function without database
- Useful for local development without PostgreSQL
- Supports guest mode without persistence requirements
- Provides resilience during temporary DB outages

**Constraints:**
- Fallback storage limited to 1000 entries per user scope
- In-memory data lost on server restart
- No cross-instance data sharing in fallback mode

**Implementation**: `lib/db-fallback.ts`

### 2. API Key Encryption

**Decision**: Server-side AES-GCM encryption with seed-derived keys

**Rationale:**
- Keys never exposed to client (except during entry)
- Encryption key derived from environment variable
- Authenticated encryption prevents tampering
- Per-user key isolation

**Constraints:**
- Changing `API_KEY_ENCRYPTION_SEED` invalidates all stored keys
- No key rotation mechanism (future enhancement)
- Keys accessible to server admins with DB + seed access

### 3. Guest Mode

**Decision**: Full app functionality without authentication

**Rationale:**
- Lower barrier to entry for evaluation
- Supports local development workflows
- Allows API key testing before account creation
- Can upgrade to authenticated account later

**Constraints:**
- Guest data persistence depends on DB availability
- No cross-device synchronization for guests
- Guest session tied to browser (localStorage)

### 4. Provider Adapter Architecture

**Decision**: Unified adapter registry with provider-specific implementations

**Rationale:**
- Consistent interface across all LLM providers
- Easy to add new providers
- Centralized error handling and retry logic
- Provider-specific features exposed through settings

**Constraints:**
- Lowest common denominator for features
- Provider-specific advanced features may not be exposed
- Rate limiting applied uniformly (not per-provider limits)

**Files:**
- `lib/providers/registry.ts`
- `lib/providers/{openai,anthropic,google,openrouter,grok}.ts`

### 5. NDJSON Streaming

**Decision**: NDJSON (newline-delimited JSON) for streaming responses

**Rationale:**
- Simple to parse on client
- Supports multiple event types (chunk, done, error, aborted)
- Works with HTTP streaming
- No special protocol overhead

**Constraints:**
- Each line must be valid JSON
- No binary data support
- Line-buffering required on client

**Format:**
```
{"type":"chunk","content":"Hello"}
{"type":"done","usage":{"tokens":42}}
```

### 6. Next.js 16 Webpack Mode

**Decision**: Pinned to webpack build mode during transition

**Rationale:**
- Turbopack still experimental in Next.js 16
- Webpack proven stable for production
- Allows gradual migration to Turbopack

**Constraints:**
- Slower build times vs. Turbopack
- Scripts include `--webpack` flag
- Will migrate to Turbopack when stable

**Commands:**
```json
{
  "dev": "next dev --webpack",
  "build": "prisma generate && next build --webpack"
}
```

### 7. Monorepo vs. Separate Repos

**Decision**: Monorepo with optional Python sidecar

**Rationale:**
- Simpler for most users (Next.js-only deployment)
- Python sidecar optional for advanced workflows
- Shared documentation and configuration

**Constraints:**
- Python dependencies separate from npm
- Sidecar must be started independently
- Not required for core functionality

### 8. Subscription Tiers

**Decision**: Three-tier model (FREE, PAID, ENTERPRISE)

**Rationale:**
- Simple tier structure
- Stripe integration for PAID/ENTERPRISE
- Usage tracking for billing

**Constraints:**
- Limited customization within tiers
- No usage-based pricing (flat tiers)
- Stripe required for PAID/ENTERPRISE

### 9. Testing Strategy

**Decision**: Vitest for unit/integration, Playwright for E2E

**Rationale:**
- Vitest faster than Jest with better ESM support
- Playwright more reliable than Cypress for E2E
- jsdom sufficient for most component tests

**Constraints:**
- jsdom limitations for some browser APIs
- E2E tests require PostgreSQL service
- Mocking Next.js features sometimes complex

### 10. Error Handling

**Decision**: Centralized error classification with severity levels

**Rationale:**
- Consistent error responses across APIs
- Error categorization for monitoring
- Retry logic based on error type

**Implementation**: `lib/providers/errors.ts`

**Error Types:**
- `rate_limit`: 429 errors with retry-after
- `auth_error`: Invalid API keys
- `token_limit`: Context length exceeded
- `network_error`: Connectivity issues
- `validation_error`: Input validation failures
- `critical`: Unrecoverable errors

### 11. Middleware Deprecation

**Known Issue**: Next.js 16 warns about `middleware.ts` deprecation

**Status**: Functional but deprecated
**Migration Path**: Move to `proxy.ts` convention
**Timeline**: Phase 2 of roadmap

### 12. Dependency Security

**Current Status**: 9 production vulnerabilities (1 high, 8 moderate)

**High Advisory**: Next.js 16.1.1 (waiting for patched release)

**Strategy:**
- Track Next.js releases for security patches
- Separate CI gates for production vs. dev dependencies
- Regular security audits with `npm audit`

---

## Appendix: Quick Reference

### Essential Commands Cheat Sheet

```bash
# Development
npm run dev                 # Start dev server
npm run build               # Production build
npm start                   # Start production server

# Quality Checks
npm run type-check          # TypeScript validation
npm run lint                # ESLint
npm run test                # Run tests (watch)
npm run test:run            # Run tests (once)
npm run test:coverage       # Tests with coverage

# Database
npx prisma generate         # Generate client
npx prisma migrate dev      # Create migration
npx prisma migrate deploy   # Apply migrations
npx prisma studio           # Database GUI

# Deployment
npm run smoke               # Smoke tests
npm run verify:prod         # Production verification
vercel deploy               # Deploy to Vercel

# Maintenance
npm ci                      # Clean install
npm audit                   # Security audit
npm run upgrade:next:prep   # Next.js upgrade readiness
```

### Directory Quick Reference

| Path | Purpose |
|------|---------|
| `app/api/` | API routes |
| `app/(pages)/` | UI pages |
| `components/ui/` | Reusable UI components |
| `lib/` | Utilities and services |
| `services/` | Business logic |
| `prisma/` | Database schema |
| `test/` | Test files |
| `scripts/` | Deployment scripts |
| `docs/` | Documentation |

### Environment Variable Quick Reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXTAUTH_URL` | Yes | Base URL |
| `API_KEY_ENCRYPTION_SEED` | Yes | Key encryption |
| `NEXTAUTH_SECRET` | Conditional | Session signing (strict auth) |
| `AUTH_REQUIRE_LOGIN` | No | Auth mode (default: false) |
| `DATABASE_URL` | No | PostgreSQL connection |
| `OPENAI_API_KEY` | No | OpenAI access |
| `ANTHROPIC_API_KEY` | No | Anthropic access |

### Port Quick Reference

| Port | Service |
|------|---------|
| 3000 | Next.js (default) |
| 5432 | PostgreSQL |
| 6379 | Redis (optional) |
| 8008 | Python sidecar (optional) |

---

**End of Project Reconstruction Document**

This document contains comprehensive information to fully reconstruct the MultiLLM Chat Assistant from scratch. For additional details, refer to the repository's documentation files: README.md, ARCHITECTURE.md, DESIGN_SYSTEM.md, and DOCUMENTATION.md.
