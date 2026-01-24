# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Essential commands for working in this codebase:
- **Development**: `npm run dev` (starts Next.js dev server on localhost:3000)
- **Database**: `npx prisma generate` (generates Prisma client after schema changes)
- **Build**: `npm run build` (production build, runs `prisma generate` automatically)
- **Testing**: 
  - `npm run test` (Vitest watch mode)
  - `npm run test:run` (single test run)
  - `npm run test:run:local` (single-threaded for sandbox environments)
  - `npm run test:coverage` (test with coverage report)
- **Type Checking**: `npm run type-check` (TypeScript strict checks)
- **Linting**: `npm run lint` (ESLint with Next.js rules)

## Architecture Overview

This is a Next.js 14 App Router application with the following key architecture:

### Core Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS + Radix UI primitives + Class Variance Authority (CVA)
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (production planned)
- **Authentication**: NextAuth.js v4 with Prisma adapter
- **Testing**: Vitest + Testing Library + jsdom environment

### Directory Structure
- `app/`: Next.js App Router pages, layouts, and API routes
- `components/`: Reusable React components (UI primitives in `components/ui/`)
- `services/`: Business logic and API clients (LLM providers, data services)
- `lib/`: Shared utilities (auth, crypto, storage, Prisma client)
- `prisma/`: Database schema and migrations
- `hooks/`: Custom React hooks
- `test/`: Vitest test files

### Key Features
- **Multi-LLM Platform**: Supports OpenAI, Anthropic, Google AI, OpenRouter
- **Streaming API**: Real-time chat responses via NDJSON streaming (`/api/llm/stream`)
- **Personas System**: Custom AI personas with configurable prompts
- **Analytics**: Usage tracking and visualization with Recharts
- **Goal Hub**: Goal tracking and management
- **Pipeline**: Multi-step LLM workflows
- **Model Comparison**: Side-by-side model comparison interface

## Database Schema

Key entities in `prisma/schema.prisma`:
- **User/Auth**: Standard NextAuth tables (User, Account, Session, VerificationToken)
- **Core Data**: Conversation, ProviderConfig, Analytics, Goal, Persona
- **Current Provider**: SQLite (file:./dev.db) for development
- **Production Plan**: PostgreSQL migration planned

To switch to PostgreSQL:
1. Update `DATABASE_URL` in environment
2. Run `npx prisma generate && npx prisma migrate deploy`

## LLM Provider Architecture

Provider abstraction in `services/llm-providers/`:
- Each provider has a dedicated service (e.g., `openai-service.ts`)
- Normalized streaming interface via `services/stream-client.ts`
- API routes in `app/api/llm/` handle provider orchestration
- Client-side encrypted storage for API keys via `lib/secure-storage.ts`

## Authentication & Security

- NextAuth.js handles OAuth (Google, GitHub) and credential auth
- API keys stored encrypted client-side, never bundled in build
- Rate limiting configured via environment variables
- Server-side validation in API route handlers

## Testing Strategy

- **Unit Tests**: Vitest for services, utilities, components
- **Integration Tests**: API routes and component interactions
- **Setup**: Test configuration in `vitest.config.ts` and `test/setup.tsx`
- **Coverage**: Exclude patterns for node_modules, .next, prisma directories

## Environment Setup

Copy `.env.example` to `.env.local` and configure:
- `DATABASE_URL`: Database connection
- `NEXTAUTH_SECRET`: NextAuth encryption key
- `NEXTAUTH_URL`: Application URL
- Provider API keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
- OAuth credentials: `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, etc.

## Code Conventions

- **Components**: PascalCase files in `components/`
- **Hooks**: `use-*.ts` naming in `hooks/`
- **Utilities**: kebab-case in `lib/` and `services/`
- **Tests**: `*.test.tsx|ts` files in `test/` directory
- **Formatting**: Prettier (2 spaces, single quotes, 80 char limit)
- **TypeScript**: Strict mode enabled, explicit types at module boundaries

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. **Test Job**: lint, type-check, test with coverage
2. **Deploy Job**: Build and deploy to Netlify (main branch only)
3. **Environment**: Uses SQLite for tests, Prisma generation required

## Known Architecture Notes

- **Python Core**: `src/core/llm_manager` exists but not integrated with Next.js runtime
- **Taskflow Directory**: Separate project, integration status unclear
- **Streaming**: NDJSON format with chunk/done/error/aborted event types
- **Security**: Client-side API key encryption, server-side proxy pattern planned