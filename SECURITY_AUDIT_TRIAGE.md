# Security Audit Triage (February 20, 2026)

## Scope
This document records dependency audit triage completed in two passes:
1. initial dependency hardening/remediation,
2. Next.js 16 migration and re-baseline.

## Commands Run
- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm audit fix` (non-breaking only; no `--force`)
- `npm view next version` (to verify latest published Next release availability)

## Pass 1: Hardening Changes
1. Moved tooling-only packages out of runtime dependency scope:
   - `vercel` -> `devDependencies`
   - `@playwright/test` -> `devDependencies`
2. Applied non-breaking remediations:
   - ran `npm audit fix` without forcing major breaks
3. Fixed Prisma package compatibility after remediation:
   - `@prisma/adapter-pg` -> `7.3.0`
   - `@prisma/client` -> `^7.3.0`
   - `prisma` -> `^7.3.0`

### Pass 1 Results
- Full graph: `58 -> 57` total (`49 -> 46 high`)
- Production-focused: `41 -> 9` total (`32 -> 1 high`)

## Pass 2: Next.js 16 Migration
1. Upgraded framework/tooling line:
   - `next` -> `16.1.1`
   - `eslint` -> `9.x`
   - `eslint-config-next` -> `16.1.1`
2. Added compatibility fixes (headers/cookies async usage, route context typing, ESLint flat config).
3. Re-ran full audits and production-only audits.

### Pass 2 Results (Current)
- Full graph: `53` total (`42 high`, `11 moderate`)
- Production-focused: `9` total (`1 high`, `8 moderate`)

## Current High-Risk Item
1. One production high-severity advisory remains on the current `next@16.1.1` line.
2. At time of triage, `npm view next version` reports `16.1.1` as latest published.
3. This indicates no newer published patch is currently available to consume immediately.

## Residual Risk Notes
1. Most remaining high findings are in dev/tooling dependency trees (`eslint` ecosystem and `vercel` transitive packages).
2. Prisma moderate advisory chain remains tied to internal development dependencies.
3. The production risk surface is now concentrated in a small set of known framework advisories.

## Recommended Follow-up
1. Monitor and adopt the next patched Next.js release as soon as published.
2. Re-run both audits immediately after upgrading Next.
3. Gate CI on production-focused vulnerabilities and track full-graph tooling findings separately.
