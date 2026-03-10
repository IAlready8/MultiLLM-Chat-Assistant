# Experiment Runtime Dependency Audit

Date: 2026-03-10
Branch: `codex/experiment-runtime-hardening-20260309`
Scope: direct production dependencies only

## Upgraded in this batch

- `framer-motion`: `12.29.2` -> `12.35.2`
- `pg`: `8.16.3` -> `8.20.0`
- `redis`: `5.8.2` -> `5.11.0`
- `stripe`: `20.0.0` -> `20.4.1`
- `zod`: `4.1.3` -> `4.3.6`

## Required compatibility fix

- [lib/stripe.ts](/Users/d4ni3l/Projects/GITREPOS/MultiLLM-Chat-Assistant/lib/stripe.ts)
  - updated Stripe SDK `apiVersion` from `2025-11-17.clover` to `2026-02-25.clover`
  - reason: the upgraded `stripe` package tightened the accepted API version literal type

## Verification

- `npm run lint`
- `npm run type-check`
- `npm run test:run`
- `NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=... API_KEY_ENCRYPTION_SEED=... DATABASE_URL=postgresql://user@127.0.0.1:5432/experiment_build AUTH_REQUIRE_LOGIN=false NEXT_PUBLIC_AUTH_REQUIRE_LOGIN=false npm run build`

Result:

- lint: passed
- type-check: passed
- tests: passed (`38` files, `260` tests)
- build: passed

## Held intentionally

- Prisma family:
  - `prisma`
  - `@prisma/client`
  - `@prisma/adapter-pg`
  - reason: generator/runtime coupling needs a dedicated review, not a mixed runtime patch batch
- major-version jumps held:
  - `react`
  - `react-dom`
  - `recharts`
  - `uuid`
  - `next-themes`
  - `lucide-react`
  - reason: broader API or UI regression risk than this branch phase allows

## Current audit conclusion

- `npm audit --omit=dev` still reports `9` production-scope vulnerabilities
- those findings are still chained through the direct `prisma` tool dependency and its transitive tree:
  - `@prisma/dev`
  - `hono`
  - `@hono/node-server`
  - `@mrleebo/prisma-ast`
  - `chevrotain`
  - `lodash`
- this batch reduced runtime drift without attempting a risky Prisma toolchain move

## Recommendation

- keep this batch
- treat Prisma/toolchain remediation as a separate Milestone 3 decision
- do not bundle Prisma upgrades into unrelated runtime hardening work
