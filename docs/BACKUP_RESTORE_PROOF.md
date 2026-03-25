# Backup And Restore Proof

This document records the current backup/restore position for Step 9.

## Current Evidence

Already proven live:
- application deployment rollback
- application deployment forward restore
- post-restore verify and smoke against canonical production

Already recorded in:
- `docs/OPERATOR_RUNBOOK.md`
- `handoff_work/DEPLOYMENT_EVIDENCE.md`

Not yet separately recorded from this branch:
- database backup and restore proof using PostgreSQL client tooling

## Why This Is Not Marked Complete Yet

The current workspace does not have PostgreSQL client tools installed:
- `psql`
- `pg_dump`
- `pg_restore`
- `createdb`

Because of that, this branch can document the procedure precisely, but it
cannot honestly claim the database backup/restore proof was executed here.

## Required Procedure

Run this only against a controlled non-production verification database first.

### Inputs
- source database URL
- scratch restore database name
- local path for the backup artifact

### Procedure
1. create a backup artifact
   - `pg_dump --format=custom --no-owner --no-privileges --dbname "$DATABASE_URL" --file <backup-file>`
2. create a scratch restore target
   - `createdb <scratch-db-name>`
3. restore into the scratch target
   - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname <scratch-db-name> <backup-file>`
4. run:
   - `DATABASE_URL=postgresql://<user>@127.0.0.1:5432/<scratch-db-name> npx prisma migrate status`
   - targeted app verification against the restored DB
5. confirm critical tables and app flows are intact
6. remove the scratch DB only after validation

## Minimum Acceptance Evidence

To close this item, capture:
- backup artifact creation succeeded
- restore into scratch DB succeeded
- `npx prisma migrate status` clean on restored target
- app verification on restored target succeeded
- timestamp and operator recorded

## Relationship To Existing Restore Proof

The already-proven Vercel deployment restore is necessary but not sufficient for
database backup/restore proof.

Both truths must be kept separate:
- application rollback/restore: proven
- database backup/restore: procedure defined here, execution evidence pending
