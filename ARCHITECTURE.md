## Architecture Overview

### Goals
- Deliver a fast, secure, multi‑LLM platform with a clean, modular codebase.
- Keep a local‑first development experience while enabling a clear path to scale.

### Non‑Goals (for now)
- Heavy agentic orchestration across distributed workers.
- Vendor‑specific coupling that prevents easy provider swaps.

## System Components
- Web App: Next.js 14 (App Router) + TypeScript UI under `app/*`.
- API Layer: Next.js Route Handlers under `app/api/*` (REST + streaming endpoints).
- Data Layer: Prisma ORM with SQLite (dev) and planned PostgreSQL (staging/prod), schema under `prisma/`.
- Auth: NextAuth (OAuth + credentials); adapters configured via Prisma.
- UI/Design System: Tailwind CSS, Radix UI primitives, CVA variants, tokens in `tailwind.config.ts` and `app/globals.css`.
- Client/Server Utilities: `lib/*`, `services/*`, `hooks/*`, reusable UI in `components/ui/*`.
- Python Core (optional): `src/core/llm_manager` — an async LLM manager with caching, provider abstraction, and tests.
- CI/CD: GitHub Actions workflow at `.github/workflows/ci.yml`, deploy target Netlify.

## High‑Level Flow
1. User interacts with pages under `app/*` and UI components in `components/*`.
2. Actions and API calls use `services/*` and `lib/*` to talk to `app/api/*` route handlers.
3. API routes orchestrate provider calls (e.g., OpenAI) using provider clients in `services/llm-providers/*` and helpers in `lib/*`.
4. Prisma persists entities (personas, analytics, auth) as defined in `prisma/schema.prisma`.
5. Streaming endpoints send chunked responses back to the UI for responsive generation.

## Data Model (at a glance)
- Auth: User, Account, Session (NextAuth tables via Prisma adapter).
- App: Persona, Conversation/Message (if present), Analytics/Event entities.
- Storage: SQLite for local dev, with migrations in `prisma/migrations/*` and a plan to move to PostgreSQL for non‑local envs.

## LLM Provider Abstraction
- Provider clients live in `services/llm-providers/*` (e.g., `openai-service.ts`).
- A thin `api-client`/`api-service` layer normalizes requests, supports streaming, and records analytics.
- `lib/secure-storage.ts` and `lib/crypto.ts` handle client‑side encrypted storage for API keys when used in the browser; server‑side reads occur only in route handlers.

## Streaming
- Endpoints under `app/api/llm/*` support streaming responses where the provider allows it.
- UI consumes streamed chunks via callbacks to render token‑by‑token updates.

## Security
- Secret management via environment variables (`.env.local`, see `.env.example`).
- Keys are never bundled client‑side by design; client helpers encrypt at rest when needed (e.g., local API keys).
- Authentication/authorization enforced in route handlers; add rate‑limiting and input validation during scale‑up.

## Python Core Engine (src/core)
- `src/core/` implements an async manager with provider interfaces, caching, and perf metrics.
- Current status: Integrated as a FastAPI sidecar service running on port 8008, communicating with Next.js via API bridge.
- Integration approach: Sidecar microservice (HTTP on localhost) that the Next.js API calls into.
- Features:
  - LLM request caching with LRU algorithm
  - Concurrent processing of multiple provider requests
  - Performance metrics and monitoring
  - Provider failover and health checks
  - Cost estimation per provider
- Communication: Next.js API routes in `app/api/llm/*` proxy requests to the Python service.

## Deployment
- CI runs lint/tests/build; deploys to Netlify. Ensure Prisma `generate` and migrations run in CI.
- Environment: `DATABASE_URL`, NextAuth secrets/URLs, provider API keys (see `.env.example`).

## Scaling Plan (Architecture)
- Data: Migrate SQLite → PostgreSQL; enable connection pooling.
- Caching/State: Introduce Redis for rate‑limiting, session extensions, and job queues.
- Workloads: Add a worker for long‑running tasks (e.g., analytics aggregation, batch inference).
- Observability: Centralized logs, error tracking, and basic metrics (latency, throughput, tokens, provider error rates).
- Resilience: Provider failover, circuit breakers, and exponential backoff in provider client calls.
- Performance: Ensure streaming parity, debounce UI updates, and benchmark concurrent throughput.

## Known Gaps
- No formal rate‑limiting and input validation on all LLM endpoints.
- CI scripts mismatch with `package.json` in places (e.g., `test:ci`, `type-check`).
- README is minimal; needs quickstart and links to docs.
- Python core not yet wired to web app; choose integration strategy.

## References
- Roadmap: `ROADMAP.md`
- Design System: `DESIGN_SYSTEM.md`
- Status: `STATUS_UPDATE.md`
- Env: `.env.example`