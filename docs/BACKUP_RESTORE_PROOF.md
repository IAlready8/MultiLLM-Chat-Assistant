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

Separately proven locally on `2026-03-25`:
- database backup and restore proof using PostgreSQL client tooling
- source database:
  - `multillm_verify_20260302`
- scratch restore target:
  - `multillm_restore_verify_20260325`
- backup artifact:
  - `/tmp/multillm_restore_verify_20260325.dump`
- operator identity:
  - `step9-backup-verify`

PostgreSQL client tools used in this proof:
- `psql`
- `pg_dump`
- `pg_restore`
- `createdb`
- `dropdb`

## Proof Result

Source and restored targets matched on:
- table set
- key row counts for:
  - `User`
  - `Conversation`
  - `Goal`
  - `Persona`

Count comparison queries used:
- source:
  - `psql "$SOURCE_DB_URL" -Atqc "select 'users='||(select count(*) from \"User\") || ',conversations='||(select count(*) from \"Conversation\") || ',goals='||(select count(*) from \"Goal\") || ',personas='||(select count(*) from \"Persona\");"`
- restored target:
  - `psql "$SCRATCH_DB_URL" -Atqc "select 'users='||(select count(*) from \"User\") || ',conversations='||(select count(*) from \"Conversation\") || ',goals='||(select count(*) from \"Goal\") || ',personas='||(select count(*) from \"Persona\");"`

Observed results:
- source:
  - `users=0,conversations=0,goals=0,personas=0`
- restored target:
  - `users=0,conversations=0,goals=0,personas=0`

Restored-target verification passed.

All verification commands below were run with `DATABASE_URL` bound to the
scratch restore target:
- `DATABASE_URL=postgresql://<user>@127.0.0.1:5432/multillm_restore_verify_20260325 npx prisma migrate status`
- `NEXTAUTH_URL=http://127.0.0.1:3000 NEXTAUTH_SECRET=step9-restore-secret-32-characters API_KEY_ENCRYPTION_SEED=step9-restore-seed-32-characters DATABASE_URL=postgresql://<user>@127.0.0.1:5432/multillm_restore_verify_20260325 bash scripts/verify-production.sh --apply-migrations`
- `NEXTAUTH_URL=http://127.0.0.1:3000 NEXTAUTH_SECRET=step9-restore-secret-32-characters API_KEY_ENCRYPTION_SEED=step9-restore-seed-32-characters DATABASE_URL=postgresql://<user>@127.0.0.1:5432/multillm_restore_verify_20260325 bash scripts/smoke-test.sh --base-url http://127.0.0.1:3000 --start-server`

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

Captured in this proof:
- backup artifact creation succeeded
- restore into scratch DB succeeded
- `npx prisma migrate status` clean on restored target
- app verification on restored target succeeded
- timestamp recorded: `2026-03-25`
- operator identity recorded: `step9-backup-verify`

## Relationship To Existing Restore Proof

The already-proven Vercel deployment restore is necessary but not sufficient for
database backup/restore proof.

Both truths must be kept separate:
- application rollback/restore: proven
- database backup/restore: procedure defined here and execution now proven
