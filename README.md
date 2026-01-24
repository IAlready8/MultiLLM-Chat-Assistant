# Personal LLM Tool

Multi‑LLM platform with chat, personas, analytics, model comparison, pipelines, and secure API key handling. Built with Next.js 14 (App Router), TypeScript, Prisma, NextAuth, Tailwind + Radix UI, and Vitest.

## Quickstart
- Requirements: Node 20+, npm, SQLite (built‑in), optional Python for core tests.
- Install: `npm ci` and generate Prisma client: `npx prisma generate`
- Env: Copy `.env.example` to `.env.local` and fill values (`DATABASE_URL`, `NEXTAUTH_SECRET`, provider keys)
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
- High‑level: Next.js App Router UI + API routes in `app/api/*`; Prisma ORM with SQLite (dev), Postgres planned for prod; NextAuth for auth; Tailwind + Radix UI + CVA for design system.
- Providers: Normalized LLM provider clients in `services/llm-providers/*` with streaming support.
- Python Core: Async LLM manager in `src/core/` with caching, provider abstraction, and performance optimization. Communicates with Next.js via API bridge.
- CI/CD: GitHub Actions workflow `.github/workflows/ci.yml`, Netlify deploy.

See `ARCHITECTURE.md` and `PYTHON_INTEGRATION.md` for full details.

## Documentation
- Roadmap: `ROADMAP.md`
- Design System: `DESIGN_SYSTEM.md`
- API/Components Guide: `DOCUMENTATION.md`
- Status: `STATUS_UPDATE.md`
- Agents/Contrib Guide: `init/AGENTS.md`

## Database
- Local: SQLite via Prisma (schema in `prisma/schema.prisma`)
- Migrations: `prisma/migrations/*`
- Planned: Postgres for staging/production

Postgres `DATABASE_URL` examples:
- Local Docker: `postgresql://postgres:postgres@localhost:5432/llmtool?schema=public`
- Managed (Neon/Supabase): `postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require&schema=public`

To switch to Postgres:
- Set `DATABASE_URL` to your Postgres URL
- Run `npx prisma generate && npx prisma migrate deploy`
- Verify in CI by setting a Postgres service or secret `DATABASE_URL`

## Environment
Fill these in `.env.local` (see `.env.example`):
- `DATABASE_URL`, `NEXTAUTH_SECRET`, OAuth creds (`GOOGLE_*`, `GITHUB_*`), and provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENROUTER_API_KEY`).

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
- CI: Lint, type‑check, test (`.github/workflows/ci.yml`)
- Netlify deploy (configure `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN`)

## Contributing
Follow `init/AGENTS.md` for roles, guardrails, conventions, and runbooks.