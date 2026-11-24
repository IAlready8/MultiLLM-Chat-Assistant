# Change & Deploy Process

Standing rules for every change to this repo. No exceptions.

## 1. Every change goes through a PR

- Work happens on a feature branch, never directly on `main`.
- Open a pull request against `main` for every change, including docs and config.

## 2. CI must be fully green before merge

These gates must all pass — not "probably fine," actually green:

- **Quality Checks** (type-check, lint, unit tests, build)
- **Coverage** (required)
- **Security Audit**
- **Smoke Tests** (redis + postgres)

If any gate fails: fix it on the branch, re-run, and confirm green before proceeding.
Never merge with a red gate.

Note: the Vercel deployment check has been failing systemically across unrelated
PRs (not a code issue). GitHub CI is the authoritative gate until the Vercel
integration is fixed.

## 3. Human approval required

- No merge without explicit approval in the current conversation.
- "Verify and proceed" covers local, reversible work only. Push, PR, merge, and
  deploy always wait for the word.

## 4. Verify the deploy

After merge, Vercel auto-deploys `main`. Confirm before calling it done:

- `GET /api/health` returns `"status": "healthy"`.
- The reported commit SHA matches the merged commit.
- Rate limiting and database checks report connected (not degraded).

If the deploy is wrong, say so — don't assume.

## 5. Risky changes need manual verification

CI is not enough for these. Flag explicitly and verify by hand:

- **Auth** (login, sessions, JWT, password flows): real sign-in / sign-out round-trip.
- **Billing** (Stripe): checkout, webhook, portal, and subscription lifecycle.
- **Database migrations**: follow section 7 (apply to production before merge,
  confirm `_prisma_migrations`, then re-check health).
- **Provider integrations**: real chat send, streaming, and cancellation.

## 6. Production database

- Lives on Neon, project `multi-llm-prod`, branch `main` — not Vercel Postgres.
- The Vercel production build does **not** run `prisma migrate deploy`.
  `scripts/build-deployment.mjs` migrates only the configured preview branch
  against the configured staging host (`PREVIEW_MIGRATION_BRANCH`,
  `PREVIEW_MIGRATION_HOST`). Production schema is always applied by hand.

## 7. Schema changes: apply first, then merge

This is the single procedure for any PR that adds a file under `prisma/migrations/`.
README and the deployment guide point here.

Why this order: merging deploys code immediately. If that code reads a column the
production database does not have yet, every request that touches it fails until
the migration lands. Applying an additive migration first is safe because the
running code ignores new columns and tables.

1. **Flag it.** Say in the PR description that it contains a migration and paste
   the migration SQL. Wait for approval before touching production.
2. **CI green on the PR.** The Smoke Tests jobs apply the migration to a fresh
   Postgres (`verify:prod -- --apply-migrations`), so they prove the SQL applies.
3. **Apply to production, before merge.** Use one of these:
   - Preferred: run `prisma migrate deploy` through the verify script. It applies
     only pending migrations and records each one in `_prisma_migrations` itself.
     Read the production connection string with hidden input so it never lands in
     shell history or logs:
     ```zsh
     read -rs "DATABASE_URL?Production DATABASE_URL: " && export DATABASE_URL
     npm run verify:prod -- --apply-migrations
     unset DATABASE_URL
     ```
   - Fallback: paste the PR's `migration.sql` into the Neon SQL editor, then record
     the migration in `_prisma_migrations` (same `migration_name` as the folder) so
     a later `migrate deploy` does not apply it again.
4. **Confirm the schema.** `npx prisma migrate status` reports no pending
   migrations. After the next deploy, `GET /api/health` reports
   `checks.database.schema` as `"current"`.
5. **Merge**, then verify the deploy as in section 4.

Non-additive changes (dropping or renaming a column or table, tightening a
constraint) cannot go first, because the running code still uses the old shape.
Split them: ship code that no longer depends on the old shape, then remove the old
shape in a later migration PR.
