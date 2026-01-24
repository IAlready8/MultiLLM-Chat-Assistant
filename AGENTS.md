# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js routes, layouts, and pages.
- `components/`: Reusable React components (PascalCase).
- `lib/`: Client utilities (auth, crypto, storage, Prisma client).
- `services/`: App services (API client, personas, analytics, exports).
- `prisma/`: Prisma schema and generated client.
- `test/`: Vitest + Testing Library unit/integration tests.
- `tests/`: Python tests (pytest) for backend/CLI utilities.
- `scripts/`, `hooks/`, `init/`: Local tooling and setup.

## Build, Test, and Development Commands
- `npm run dev`: Start Next.js dev server.
- `npm run build`: Build app; runs `prisma generate` via `prebuild`.
- `npm start`: Serve production build.
- `npm run lint`: Lint with ESLint (`next/core-web-vitals`).
- `npm run type-check`: Strict TypeScript checks.
- `npm run test`: Run Vitest; `npm run test:coverage` for coverage.
- Python (optional): `pytest -q` in `tests/`; install deps via `poetry install` or `pip install -r requirements.txt`.

## Coding Style & Naming Conventions
- **Formatting**: Prettier (2 spaces, single quotes, trailing commas, ~80 cols).
- **Linting**: Fix ESLint issues before PR; no ignored warnings.
- **TypeScript**: `strict: true`; add explicit types at module boundaries.
- **Names**: Components `PascalCase`, hooks `use-*.ts`, utilities `kebab-case.ts`.
- **Files**: Co-locate small helpers; avoid one‑letter vars; no license headers.

## Testing Guidelines
- **Frameworks**: Vitest + Testing Library (JS/TS); Pytest for Python utils.
- **Conventions**: `*.test.ts(x)` under `test/`; mirror source paths.
- **Stability**: Avoid flaky timers and real network calls.
- **Run**: `npm run test` locally and keep `npm run test:coverage` clean.

## Commit & Pull Request Guidelines
- **Commits**: Conventional Commits (e.g., `feat:`, `fix:`, `perf:`, `chore:`; optional scopes like `feat(security): ...`).
- **PRs**: Clear description, linked issues, screenshots for UI changes, and test notes. Include migration notes when Prisma schema changes.
- **Checks**: Ensure `npm run lint`, `npm run type-check`, and tests pass.

## Security & Configuration Tips
- **Env**: Copy `.env.example` to `.env.local`; never commit secrets.
- **Keys**: Validate API keys with `node test-api-key.js`.
- **Database**: Keep Prisma schema in sync; run `npx prisma generate` if needed.
- **Context**: See `ARCHITECTURE.md` and `DESIGN_SYSTEM.md` for deeper details.