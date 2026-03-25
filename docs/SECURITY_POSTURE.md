# Security Posture

This document is the authoritative Step 9 security posture summary for the
current roadmap branch.

## Scope

This posture covers:
- authentication and session handling
- admin-surface access control
- runtime secret requirements
- Stripe webhook verification
- logging sanitization
- backup and restore procedure status
- incident-response references

This document does not claim enterprise certification or external compliance.
It records the actual controls and proofs present in this repository.

## Authority Chain

- threat model:
  - `docs/THREAT_MODEL.md`
- secrets rotation procedure:
  - `docs/SECRET_ROTATION.md`
- backup and restore proof status:
  - `docs/BACKUP_RESTORE_PROOF.md`
- operator incident flow:
  - `docs/OPERATOR_RUNBOOK.md`

## Current Security Contract

Production core security requires:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`

Optional but security-sensitive subsystems:
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRO_PRICE_ID`
  - `STRIPE_WEBHOOK_SECRET`
- OAuth providers:
  - provider client ID + client secret pairs
- Redis:
  - `REDIS_URL`
- Python sidecar:
  - `PYTHON_CORE_URL`

Fail-closed rules already enforced in code:
- production startup rejects missing core auth and encryption secrets
- strict auth is enforced in production even when local demo flags are false
- Stripe webhook processing rejects missing signatures and missing webhook secret
- admin routes require authenticated `OWNER` or `ADMIN` users

## Auth And Session Review

Primary implementation files:
- `lib/auth.ts`
- `lib/api-auth.ts`
- `lib/session-cookie.ts`
- `proxy.ts`

Security-relevant behaviors already present:
- production secret resolution fails closed when auth secret is missing
- strict-auth middleware protects page and API surfaces
- `/api/health` and `/api/webhooks/stripe` remain intentionally public
- session-cookie parsing supports direct and chunked NextAuth cookies
- JWT decryption failures are treated as unauthenticated, not server-success
- admin access requires `OWNER` or `ADMIN`
- guest access is limited to non-strict mode only

Existing proof coverage:
- `test/api-auth.test.ts`
- `test/auth-session-reader.test.ts`
- `test/middleware-auth-routing.test.ts`
- `test/api-admin-status-route.test.ts`
- `test/api-subscriptions-routes.test.ts`
- `test/api-stripe-webhook-route.test.ts`
- `test/runtime-secrets.test.ts`
- `test/logging-safety.test.ts`

## Logging And Secrets Handling

Current logging controls:
- request/response logging uses structured logger helpers
- secret-bearing fields are sanitized by `lib/log-sanitizer.ts`
- tests assert redaction of authorization headers, API keys, tokens, webhook
  secrets, and related fields

Current limitation:
- some older auth and webhook paths still use direct `console.*` logging for
  exceptional conditions
- those logs are still protected by runtime context and sanitizer coverage, but
  they are less uniform than the structured logger path

## Backup And Restore Status

Application deployment rollback and forward restore are already proven live.

Database backup and restore status:
- procedure is now documented in `docs/BACKUP_RESTORE_PROOF.md`
- local proof is not recorded yet from this branch because PostgreSQL client
  tools (`psql`, `pg_dump`, `pg_restore`) are not installed in this workspace

That is an evidence gap, not a guessed pass.

## Current Step 9 Status

Completed in this slice:
- explicit threat model
- explicit auth/session review summary
- explicit secrets rotation procedure
- explicit backup/restore procedure and current proof status
- incident-response linkage

Still required before Step 9 can be called complete:
- execute and record the database backup/restore proof using PostgreSQL client
  tooling in a controlled environment
