## What and why

<!-- One or two sentences: what changes and which problem it fixes. -->

## Evidence

<!-- Commands run and their results. Separate what was verified from what was not. -->

- Verified:
- Not verified:

## Checklist

- [ ] Every behaviour change is covered by a test that fails without the change
- [ ] CI is fully green: Quality Checks, Coverage, Security Audit, Smoke Tests (redis + postgres)
- [ ] No secrets, keys or connection strings in code, logs, tests or this description

## Database schema

- [ ] This PR adds **no** file under `prisma/migrations/`

If it does, leave that box unticked and complete
[Change & Deploy Process, section 7](../docs/CHANGE_AND_DEPLOY_PROCESS.md#7-schema-changes-apply-first-then-merge) instead:

- [ ] Migration SQL pasted below and flagged for approval
- [ ] Migration is additive (non-additive changes are split across PRs)
- [ ] Applied to production Neon **before** merge, recorded in `_prisma_migrations`
- [ ] `npx prisma migrate status` reports nothing pending against production

<!-- Migration SQL, if any: -->

## Risky areas touched

<!-- Auth, billing, migrations or provider integrations need a manual check after deploy (process doc, section 5). Say which. -->
