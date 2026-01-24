## Repo Agents Init

This document defines lightweight roles, guardrails, and runbooks for AI and human contributors collaborating in this repository.

### Roles
- Product Agent: Aligns work with `ROADMAP.md`, prioritizes issues, writes acceptance criteria.
- Docs Agent: Maintains `README.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, and quickstarts.
- Code Agent (Web): Implements features in `app/*`, `components/*`, `services/*`, `lib/*`, with tests.
- Code Agent (Core): Maintains `src/core/llm_manager` and its tests, plans integration surface.
- Test Agent: Keeps Vitest/JSDOM tests green; adds focused tests for regressions; maintains Pytest for `src/core`.
- Infra Agent: Owns CI/CD (if added), Prisma migrations, environment validation, and deployments.

### Guardrails
- Security: Never commit secrets; read from environment. Follow `.env.example`.
- Privacy: Avoid logging sensitive inputs. Redact API keys and PII.
- Scope: Fix only related issues; avoid drive‑by refactors without consensus.
- Compatibility: Keep changes consistent with the codebase style and TypeScript types.

### Conventions
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`...).
- Branches: `feature/<scope>`, `fix/<scope>`, `docs/<scope>`.
- PRs: Include “what/why/how”, tests, and screenshots for UI.
- Tests: Start narrow, then broaden. Prefer unit tests near changed code.
- Lint/Typecheck: `npm run lint`, `npm run type-check` (or `tsc -p .`).

### Runbooks
- Setup
  - Node 20+, `npm ci`, `npx prisma generate`.
  - Copy `.env.example` to `.env.local` and fill required keys.
  - `npm run dev` to start Next.js.
- Tests
  - Web: `npm run test:run` (or `vitest run`), `npm run test:coverage`.
  - Core: `pytest` inside Python env; dependencies from `requirements.txt`.
- Database
  - Local: PostgreSQL (see `prisma/schema.prisma`).
  - Migration: `npx prisma migrate dev` (dev); `npx prisma migrate deploy` (prod).

### Decision Log
- Use `STATUS_UPDATE.md` to record key decisions and current focus.
- Link to issues/PRs and note tradeoffs (performance, security, complexity).

### Integration Strategy (Core ↔ Web)
- Short term: Keep `src/core` standalone with tests; implement parity in TS for most web paths.
- Mid term: Introduce a sidecar microservice for advanced batching/scheduling if needed.
- Long term: Evaluate unification (all‑TS) or solidified service boundary with gRPC/HTTP.
