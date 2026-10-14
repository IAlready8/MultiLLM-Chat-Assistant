# Release repair checkpoint — 2026-10-14

Base: origin/main 0cc4c011b9617ff913733c47289052639ef3c431.
Local branch: codex/release-reconciliation-20261014, based on the existing password-hardening branch dca80cc. Code fixes are published in draft PR #175. Approved production migration reconciliation is complete; no main merge performed.

## Independently verified before repair

- Neon multi-llm-prod: sparkling-tooth-68325073; main branch br-misty-union-airznwzl; database neondb; endpoint ep-wild-morning-aizgqp89.
- Migration ledger contains only 20260117134259_init (finished).
- Generation, LlmQuotaUsage and StripeWebhookEvent relations are absent.
- Message lacks clientId, generationStatus, instanceId, position and turnId.
- Subscription lacks stripeStatus and stripeCancelAtPeriodEnd.
- RateLimitBucket exists, including its primary key and expiresAt index, but its migration is not recorded. A SELECT with LIMIT 0 succeeds as the database owner. This does not prove the deployed application points at this database or has working limiter access.
- Existing password fixes: origin/fix/change-password-gaps dca80cc344321aeb9c8ab437a90be4d47715b97b; 9 commits / 9 files. Do not duplicate blindly.
- CI https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/runs/38607406951 fails: 801 passed, 1 failed; test/auth-session-reader.test.ts session shape expectation. Quality and Coverage failed; Smoke skipped.
- NEON_DATA_API_URL was added and verified in Vercel production configuration earlier. It has no application consumer and is not a database repair.

## Execution after approval

- User approved auth/schema repairs and backed-up staged production reconciliation.
- Snapshot created: snap-polished-shape-ai40jph6, pre-release-repair-20261014, 2026-10-14T18:54:17Z.
- Isolated Neon copy creation failed with HTTP 422: branches limit exceeded. Do not delete existing branches or skip the rehearsal prerequisite.
- Production health subsequently reported healthy / PostgreSQL limiter connected. No agent database repair caused this; root cause of the prior outage remains unknown.
- Existing password-hardening branch adopted by local fast-forward. Fixed session-version expectation, password UTF-8 byte messaging/client validation, and added explicit reauthentication link.
- Password writes now compare the verified old hash atomically via updateMany; overlapping stale writes receive 409. Regression test added.
- Node 22.22.0 local validate:all exited 0 with 93 test files / 803 tests, type-check, zero-warning lint and production build. Build uses non-secret CI-style environment placeholders, not live credentials.
- Coverage gate exited 0. Runtime smoke evidence is recorded outside the repository; no real-provider proof is claimed.
- Generation, quotas and webhook table gaps remain; passwordVersion migration remains pending too. Existing RateLimitBucket exact columns/types/nullability/defaults and both expected indexes were verified.
- Production counts at review: 18 users, 1 conversation, 6 messages, 1 subscription. No row data printed or copied.

## Completed migration reconciliation

- User cleared Neon branch capacity. Production copy created: br-dry-dust-aifge58m, verify-release-repair-20261014.
- Local Prisma migration access was blocked by PostgreSQL hostname DNS (EAI_AGAIN). Used a short-lived, nonpersistent Vercel Node 22 sandbox with the tested published tree; it was stopped after work.
- Copy: Prisma migrate resolve --applied 20260908181000_postgres_rate_limits recorded the verified existing table; migrate deploy applied the remaining five migrations, including passwordVersion.
- Copy: Prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code returned No difference detected / exit 0.
- Production: repeated the rehearsed resolve/deploy procedure under explicit user approval. All migrations have been successfully applied / exit 0. Seven successful migration records now exist.
- Production: migrate status reported Database schema is up to date / exit 0; schema diff reported No difference detected / exit 0.
- Existing User, Conversation, Message and Subscription rows were fingerprinted over their original columns. All four fingerprints match before/after and match the rehearsal copy. Counts remain 18 / 1 / 6 / 1.
- Production health reports healthy, database connected and PostgreSQL limiter connected. App commit remains 0cc4c01; password code is not yet deployed.
- PR #175 initial head 29a8500ca65c15ca17e51f6e3c232af4056b03a8 passed all six CI jobs: https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/runs/38620278109. Native PostgreSQL and Redis integration, desktop/mobile account/history browser QA passed; provider fixtures are controlled.
- Added real password integration checks to the existing isolated-database runner: wrong current password, multibyte rejection, concurrent update exclusion, persisted hash/version, revocation of both sessions and fresh login. Final CI must execute these before merge.

## Required repair sequence

1. Approval for auth/schema changes and production reconciliation is now obtained. Preserve the separate final main merge gate.
2. Backup, isolated copy, schema reconciliation and production migration are complete. Preserve snapshot snap-polished-shape-ai40jph6; do not drop/recreate existing tables.
3. Wait for final password-integration CI and inspect exact current candidate/main heads. Do not merge before the explicit main merge gate.
4. Deploy password code only after approved merge; schema is ready. Verify deployed auth and account behavior.
7. Review Jev #170 and remaining branches for actual missing improvements; keep separate PRs and verify before main merge.
8. Verify real Google sign-in, one real model chat, cancellation/reload, Stripe test lifecycle and production cron recovery. Credentials/account configuration and explicit spend approval may be needed.

## Next command after approval

git fetch origin
git log --oneline origin/main..origin/codex/release-reconciliation-20261014

Remaining gates: final password integration CI, explicit main merge approval, live Google/provider/Stripe verification and email-service policy for account recovery/verified email changes. No release-ready claim.
