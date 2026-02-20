# Project Roadmap: MultiLLM Chat Assistant

## Current Position (as of February 20, 2026)
- Next.js migration branch to `16.1.1` is implemented and quality gates are green.
- Route/runtime compatibility updates for Next 16 are in place.
- Security baseline improved substantially from original state, but one production high advisory remains tied to current Next release line.

## Phase 1: Foundation and Reliability
### Status: Complete
- Unified app/API structure
- Stable CI quality gates (`type-check`, `lint`, `tests`, `build`)
- Build reliability with explicit production env requirements

## Phase 2: Security and Dependency Hardening
### Status: In Progress
- [x] Move tooling packages out of runtime dependency scope
- [x] Apply non-breaking audit remediations
- [x] Land Next.js major upgrade branch (`next@16.1.1`) with compatibility fixes
- [ ] Consume patched Next.js release that clears the remaining production high advisory
- [ ] Migrate deprecated `middleware.ts` convention to `proxy.ts`
- [ ] Separate CI reporting/gating for runtime vs tooling vulnerabilities

## Phase 3: Runtime Consolidation
### Status: In Progress
- [ ] Remove/retire legacy parallel API client paths
- [ ] Standardize provider calls through unified provider runtime
- [ ] Reduce fallback-path duplication across services

## Phase 4: Feature Depth and Observability
### Status: Planned
- [ ] Expand analytics and admin diagnostics coverage
- [ ] Add true external-provider integration smoke coverage
- [ ] Tighten orchestration telemetry and error budgeting

## Phase 5: Product and Platform Scale
### Status: Planned
- [ ] Team/collaboration depth
- [ ] Billing/subscription operational hardening
- [ ] Deployment/documentation workflow polish

## Next 30-Day Execution Priorities
1. Track and adopt patched Next.js release; re-baseline audits immediately.
2. Complete middleware-to-proxy migration and remove deprecation warning.
3. Enforce production-focused vulnerability threshold in CI while tracking tooling advisories separately.
