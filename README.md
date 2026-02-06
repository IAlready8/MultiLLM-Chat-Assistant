# MultiLLM Chat Assistant

[![License](https://img.shields.io/github/license/IAlready8/MultiLLM-Chat-Assistant)](LICENSE)
![Last Commit](https://img.shields.io/github/last-commit/IAlready8/MultiLLM-Chat-Assistant/main)
![Issues](https://img.shields.io/github/issues/IAlready8/MultiLLM-Chat-Assistant)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

Multi-LLM platform with chat, personas, analytics, model comparison, pipelines, and AI Roundtable (AI-to-AI conversations). Built with Next.js 14 (App Router), TypeScript, Prisma, NextAuth, Tailwind + Radix UI, and Vitest.

## Highlights
- Multi-provider chat with streamed responses
- Persona management and reusable prompts
- AI Roundtable for AI-to-AI conversations
- Provider configuration and secure API key handling
- Analytics and model comparison workflows

## Quickstart
- Requirements: Node 20+, npm, PostgreSQL running locally, optional Python for core tests.
- Install: `npm ci`
- Env: `cp .env.example .env.local` and set `DATABASE_URL`, `NEXTAUTH_SECRET`, `SECURE_STORAGE_SECRET`, and provider keys.
- Prisma: `npx prisma generate` then `npx prisma migrate dev`
- Dev: `npm run dev` (Next.js at `http://localhost:3000`)

## Scripts
- `npm run dev`: Start dev server
- `npm run build`: Build production bundle
- `npm run start`: Start production server
- `npm run lint`: Lint codebase
- `npm run type-check`: TypeScript type checks
- `npm run test`: Run Vitest in watch mode
- `npm run test:run`: Run Vitest once
- `npm run test:run:local`: Run tests single-threaded (sandbox-safe)
- `npm run test:coverage` / `npm run test:ci`: CI‑style run with coverage

## Architecture
- High-level: Next.js App Router UI + API routes in `app/api/*`; Prisma ORM with PostgreSQL; NextAuth for auth; Tailwind + Radix UI + CVA for design system.
- Providers: Normalized LLM provider clients in `services/llm-providers/*` with streaming support.
- Python Core: Async LLM manager in `src/core/` with caching, provider abstraction, and performance optimization. Communicates with Next.js via API bridge.
- CI/CD: Not configured in this repo (add a workflow if needed).

See `ARCHITECTURE.md` and `PYTHON_INTEGRATION.md` for full details.

## Documentation
- Roadmap: `ROADMAP.md`
- Design System: `DESIGN_SYSTEM.md`
- API/Components Guide: `DOCUMENTATION.md`
- Status: `STATUS_UPDATE.md`
- Agents/Contrib Guide: `init/AGENTS.md`

## Where To Look For Structure/Recovery Docs
- `ARCHITECTURE.md`: System overview, data flow, and integration points.
- `DESIGN_SYSTEM.md`: UI tokens, component patterns, and styling conventions.
- `DOCUMENTATION.md`: API/services/component reference and usage examples.
- `ERROR_FIXES_SUMMARY.md`: Historical fixes and known pitfalls.
- `STATUS_UPDATE.md`: Current state and notable changes.
- `CHANGELOG.md`: Timeline of noteworthy changes.

## Database
- Prisma + PostgreSQL (schema in `prisma/schema.prisma`)
- Migrations live in `prisma/migrations/*`

`DATABASE_URL` examples:
- Local Docker: `postgresql://postgres:postgres@localhost:5432/llmtool?schema=public`
- Managed (Neon/Supabase): `postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require&schema=public`

To apply migrations:
- Local dev: `npx prisma migrate dev`
- Production: `npx prisma migrate deploy`

## Environment
Fill these in `.env.local` (see `.env.example`):
- `DATABASE_URL`, `NEXTAUTH_SECRET`, `SECURE_STORAGE_SECRET`, OAuth creds (`GOOGLE_*`, `GITHUB_*`), and provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`).

Auth modes:
- Guest/dev mode (default): `AUTH_REQUIRE_LOGIN=false` allows saving provider keys without creating an account.
- Strict real-auth mode: set `AUTH_REQUIRE_LOGIN=true` and `NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=true`, then configure `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, OAuth credentials, and database-backed auth.

## Testing
- Web (Vitest): `npm run test:run`, coverage with `npm run test:coverage`
- Core (Pytest): `pip install -r requirements.txt && pytest` (optional)

## Streaming
- Endpoint: `POST /api/llm/stream` returns `application/x-ndjson` with events:
  - `{ type: 'chunk', content: string }` repeated, then `{ type: 'done' }`, and `{ type: 'error' }` on failure, `{ type: 'aborted' }` on cancel.
- Client helper: `services/stream-client.ts` provides `streamChat(provider, messages, options, onEvent)` and returns a handle with `abort()`.

Rate limits (env-tunable):
- `RATE_LIMIT_LLM_PER_USER_PER_MIN` (default 60)
- `RATE_LIMIT_LLM_GLOBAL_PER_MIN` (default 600)
- `RATE_LIMIT_LLM_WINDOW_MS` (default 60000)

## Observability
- Structured logs: server emits JSON logs via `lib/logger.ts`
- Basic metrics: request timing and token usage included in analytics events

## License
MIT — see `LICENSE`.

## Deploy
- Build: `npm run build` (runs `prisma generate` via `prebuild`)
- Migrations: `npx prisma migrate deploy` before starting the app
- Hosting: Vercel or Netlify supported; see `VERCEL_DEPLOYMENT.md`

## Contributing
Follow `init/AGENTS.md` for roles, guardrails, conventions, and runbooks.
