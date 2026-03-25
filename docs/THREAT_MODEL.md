# Threat Model

This is the repository threat model for the current product contract.

## Protected Assets

- user accounts and sessions
- provider API keys stored by the app
- conversation and persona data
- analytics and workflow telemetry
- billing state and Stripe customer linkage
- production deployment and environment configuration

## Trust Boundaries

Primary trust boundaries:
- browser to Next.js app
- Next.js app to Postgres
- Next.js app to third-party LLM providers
- Next.js app to Stripe
- Next.js app to optional Redis
- Next.js app to optional Python sidecar
- operators to deployment platform and environment variables

## Highest-Risk Attack Classes

### 1. Session and auth bypass

Risk:
- an unauthenticated user reaches protected routes or APIs

Current controls:
- strict auth enforced in production middleware
- auth secret required in production
- server-side auth checks on protected API routes
- admin routes require `OWNER` or `ADMIN`

Evidence:
- `test/api-auth.test.ts`
- `test/middleware-auth-routing.test.ts`
- `test/auth-session-reader.test.ts`

### 2. Secret disclosure

Risk:
- auth secrets, encryption seeds, provider keys, cookies, or Stripe secrets leak
  through logs, docs, examples, or exports

Current controls:
- docs avoid real secret values
- log sanitizer redacts secret-bearing fields
- legacy exports do not restore API keys
- production startup validation enforces required secret families

Evidence:
- `test/logging-safety.test.ts`
- `test/export-import-service.test.ts`
- `test/runtime-secrets.test.ts`

### 3. Billing webhook forgery or replay

Risk:
- Stripe state changes are accepted from unsigned or malformed requests

Current controls:
- Stripe signature header required
- webhook secret required when billing is enabled
- Stripe event construction verifies signature before processing

Evidence:
- `test/api-stripe-webhook-route.test.ts`

### 4. Admin-surface overexposure

Risk:
- non-admin users access diagnostic surfaces or error stats

Current controls:
- `getAuthenticatedAdmin()` gate
- explicit `403` path for non-admin users

Evidence:
- `test/api-auth.test.ts`
- `test/api-admin-status-route.test.ts`
- `test/api-admin-errors-stats-route.test.ts`

### 5. Optional dependency degradation causing unsafe behavior

Risk:
- Redis, sidecar, or Stripe failures are misreported or treated as healthy

Current controls:
- health/admin diagnostics separate core and optional subsystems
- degraded optional systems remain visible in health/admin status
- reliability gate verifies degraded dependency reporting

Evidence:
- `test/api-health-route.test.ts`
- `test/api-admin-status-route.test.ts`
- `test/cache.test.ts`
- `test/rate-limit.test.ts`
- `docs/RELIABILITY_SLOS.md`

## Threats Explicitly Not Solved Here

- malicious operator with deployment-platform access
- compromised provider accounts outside this app
- enterprise compliance controls not implemented in this repo
- external WAF, DDoS, or managed network controls not modeled here

## Residual Risks

- database backup/restore proof is not yet recorded from this branch
- Prisma-family dependency advisory chain remains intentionally held pending a
  coordinated upgrade with real payoff
- some auth/webhook exceptional logs are still emitted through direct
  `console.*` paths rather than fully structured logger wrappers

These residual risks are explicit so they can be managed deliberately rather
than hidden behind a generic “secure enough” claim.
