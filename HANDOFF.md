# Release repair checkpoint — 2026-10-14

Base: origin/main 0cc4c011b9617ff913733c47289052639ef3c431.
Local branch: codex/release-reconciliation-20261014, based on the existing password-hardening branch dca80cc. Local code fixes are now implemented; no production database writes or main merge performed.

## Independently verified

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

## Required repair sequence

1. Approval for auth/schema changes and production reconciliation is now obtained. Preserve the separate final main merge gate.
2. Create a production backup/snapshot; verify which database the running deployment actually uses without disclosing credentials.
3. Rehearse on an isolated database copy. Compare full RateLimitBucket columns/types/defaults/constraints against the tracked migration before considering Prisma migrate resolve --applied for the already-existing migration. Do not drop/recreate the table.
4. Use supported Prisma migration tooling to reconcile the existing table and deploy pending migrations; verify schema and preserved data. No migration reset or db push.
5. Review password branch, repair its failing session contract test without weakening assertions, verify revocation across protected routes and improve reauthentication UX. Complete all validation gates.
6. Apply approved production schema changes before deploying code that requires passwordVersion. Check health and real authenticated persistence.
7. Review Jev #170 and remaining branches for actual missing improvements; keep separate PRs and verify before main merge.
8. Verify real Google sign-in, one real model chat, cancellation/reload, Stripe test lifecycle and production cron recovery. Credentials/account configuration and explicit spend approval may be needed.

## Next command after approval

git diff origin/main...origin/fix/change-password-gaps -- lib/auth.ts lib/api-auth.ts test/auth-session-reader.test.ts

Current blocker: Neon branch quota prevents an isolated production-copy rehearsal. Production migration reconciliation must wait for an approved rehearsal target or additional branch capacity. Main merge approval and real external-provider/account verification also remain outstanding. No release-ready claim.
