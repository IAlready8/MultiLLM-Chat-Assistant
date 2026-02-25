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

This is a Next.js 16 App Router application with the following key architecture:

### Core Stack
- **Frontend**: Next.js 16 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS + Radix UI primitives + Class Variance Authority (CVA)
- **Database**: Prisma ORM with PostgreSQL
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
- **Database**: PostgreSQL for local and production environments

To apply migrations:
1. Local dev: `npx prisma migrate dev`
2. Production: `npx prisma migrate deploy`

## LLM Provider Architecture

Provider abstraction in `lib/providers/`:
- Each provider has a dedicated adapter (e.g., `openai.ts`, `anthropic.ts`)
- Shared registry via `lib/providers/registry.ts`
- Shared error classification via `lib/providers/errors.ts`
- API routes in `app/api/llm/` use the same adapter runtime for parity

## Authentication & Security

- NextAuth.js handles OAuth (Google, GitHub) and credential auth
- API keys stored encrypted server-side in `ProviderConfig` via `lib/api-key-service.ts`
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

Configured in `.github/workflows/ci.yml`.
Current pipeline runs install, Prisma generate, type-check, lint, test (`test:run`), build, and smoke checks.

## Known Architecture Notes

- **Python Core**: `src/core/llm_manager` exists but not integrated with Next.js runtime
- **Taskflow Directory**: Separate project, integration status unclear
- **Streaming**: NDJSON format with chunk/done/error/aborted event types
- **Security**: Client-side API key encryption, server-side proxy pattern planned
