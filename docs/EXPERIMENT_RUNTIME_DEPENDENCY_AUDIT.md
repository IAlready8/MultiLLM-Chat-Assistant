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

- [lib/stripe.ts](/lib/stripe.ts)
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
  - coordinated hold applied at `7.3.0`:
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

## Direct dependency decision matrix

| Package | Current | Latest checked | Decision | Reason |
| --- | --- | --- | --- | --- |
| `framer-motion` | `12.35.2` | `12.36.0` | hold | low-value patch delta after a fresh runtime upgrade; no current issue driving another bump |
| `pg` | `8.20.0` | `8.20.0` | keep | current and latest already aligned |
| `redis` | `5.11.0` | `5.11.0` | keep | current and latest already aligned |
| `stripe` | `20.4.1` | `20.4.1` | keep | current and latest already aligned after compatibility fix |
| `zod` | `4.3.6` | `4.3.6` | keep | current and latest already aligned |
| `react` | `18.3.1` | `19.2.4` | hold | major-version change would widen framework compatibility scope beyond this branch phase |
| `react-dom` | `18.3.1` | `19.2.4` | hold | same scope risk as `react` |
| `recharts` | `2.15.4` | `3.8.0` | hold | major UI/runtime change; not justified by current hardening scope |
| `uuid` | `11.1.0` | `13.0.0` | hold | major-version change with low current risk payoff |
| `next-themes` | `0.2.1` | `0.4.6` | hold | non-core runtime value; UI/theme regression surface is broader than current phase |
| `lucide-react` | `0.354.0` | `0.577.0` | hold | wide icon/UI churn potential with no current production issue |
| Prisma family | `7.3.0` | `7.5.0` | coordinated hold | latest line still preserves the advisory chain and needs a dedicated upgrade batch |

## Upgrade order if this branch continues

Only revisit direct dependency changes in this order:

1. tiny non-breaking patch bumps with direct runtime value and zero contract impact
2. coordinated Prisma-family change only if the transitive advisory chain is actually improved
3. major UI/framework upgrades only in a separate branch phase with explicit regression budget

Everything else stays out of scope for this hardening branch until a concrete runtime issue justifies the risk.

## Current audit conclusion

- `npm audit --omit=dev` still reports `9` production-scope vulnerabilities as of `2026-03-12`
- severity breakdown:
  - `4` high
  - `5` moderate
- the current report still chains all findings through the Prisma toolchain:
  - direct package in the report:
    - `prisma`
  - transitive packages in the report:
    - `@prisma/dev`
    - `hono`
    - `@hono/node-server`
    - `@mrleebo/prisma-ast`
    - `chevrotain`
    - `lodash`
- latest coordinated Prisma-family release check:
  - `prisma@7.5.0`
  - `@prisma/client@7.5.0`
  - `@prisma/adapter-pg@7.5.0`
- latest Prisma still resolves to the same vulnerable Prisma-dev chain:
  - `@prisma/dev@0.20.0`
  - `hono@4.11.4`
  - `@hono/node-server@1.19.9`
  - `@mrleebo/prisma-ast@0.13.1`
- conclusion: upgrading the Prisma family now would widen change risk without removing the current audit chain
- this batch reduced runtime drift without attempting a risky Prisma toolchain move

## Finding triage

### Direct vs transitive

| Package | Direct in repo | Severity | Current decision |
| --- | --- | --- | --- |
| `prisma` | yes | high | hold at coordinated `7.3.0` until Prisma upgrade removes the toolchain chain |
| `@prisma/dev` | no | high | transitive via `prisma`; not independently controllable here |
| `hono` | no | high/moderate | transitive via `@prisma/dev`; hold with Prisma decision |
| `@hono/node-server` | no | high | transitive via `@prisma/dev`; hold with Prisma decision |
| `@mrleebo/prisma-ast` | no | moderate | transitive via `@prisma/dev`; hold with Prisma decision |
| `chevrotain` | no | moderate | transitive via `@mrleebo/prisma-ast`; hold with Prisma decision |
| `lodash` | no | moderate | transitive via parser toolchain; hold with Prisma decision |

### Operational impact

- current exposure is tied to the Prisma CLI/tooling chain, not to a direct Next.js request-path dependency introduced in this branch
- this branch did not expand Prisma usage or add a new runtime surface that depends on `hono` or `@hono/node-server`
- because the current latest Prisma line still resolves to the same transitive chain, an immediate Prisma-family bump would add migration and generator risk without removing the current advisories

### Upgrade trigger

Re-open the Prisma-family decision only when one of these becomes true:

- the latest coordinated Prisma release resolves the `@prisma/dev` chain to fixed versions
- the project needs a Prisma feature or bugfix that justifies a dedicated coordinated upgrade batch
- a verified exploit path is found that materially affects this app beyond the current toolchain exposure

Until then, the correct Milestone 3 posture on this branch is:

- keep the Prisma family version-locked together
- document the hold clearly
- avoid bundling Prisma changes into unrelated runtime hardening work

## Recommendation

- keep this batch
- treat Prisma/toolchain remediation as a separate Milestone 3 decision after a dedicated upgrade plan exists
- do not bundle Prisma upgrades into unrelated runtime hardening work
