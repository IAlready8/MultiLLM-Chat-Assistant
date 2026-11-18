# ManyOne finite V1 reconciliation — November 17, 2026 (Toronto)

Baseline: main `5c7892674765e1f7ce84f7c8843fe0a0eb1ad06c`. This candidate preserves newer public UI, export/usage, route throttles and CI work while restoring the missing finite-release safeguards. Production has not been merged, migrated, configured or deployed by this work.

## Confirmed offer and operator

The owner confirmed **ManyOne**, **Daniel Frydenberg** as individual operator, and **itsokialready8@gmail.com** as support contact. These are prepared in the candidate environment example, not silently applied to production. Governing law is not inferred from timezone. The selected draft policy permits a refund request for the first workspace payment within 14 days; refunds are manual and separate from cancellation/deletion. Backup retention and actual support/alert receipt still require operational verification.

BYOK only. Free 50 / Pro 2,000 attempted provider generations per UTC calendar month, CAD 19/month, four selected models, paid access through the paid period after renewal cancellation. Confirmed account deletion ends access/subscription immediately with no automatic refund. Enterprise is not sold; the internal example cap is zero. Provider test spending is capped at CAD 5 aggregate; this execution has dispatched no real vendor requests.

## Implemented

- Production quotas reject missing, malformed, unlimited or drifting Free/Pro configuration, retaining PostgreSQL locking and the existing usage ledger. Admin readiness agrees with enforcement.
- Four-model admission is shared across startup selection, add/remove controls, request positions, batches and saved-turn races. A distinct fifth selection cannot bypass the cap by reusing position zero. Saved history and explicit regeneration remain.
- Deferred page/API gates reject Roundtable, Pipeline, Goals, Teams, Jev and decisions. Implementations/data remain in source. Home/nav/settings entry points are filtered. Production ignores the optional sidecar, including health probes.
- Provider eligibility is consistent across settings, model selectors, runtime and health. Initial production shortlist is OpenAI/Anthropic/Google; actual vendor tests remain mandatory before advertising each integration. Health now explicitly says it does not test generation.
- Public root explains the product/offer before sign-in; authenticated users reach the preserved workspace home. Public path checks are exact; private APIs/children remain protected.
- Checkout requires explicit paid-signup and legal-approval flags, actual operator/contact configuration and the approved finite allowance. Stripe's price must match CAD 19 monthly. Invalid billing origins fail before Stripe resources. Existing subscribers retain portal management. Preview billing accepts sandbox keys only; wrong-mode signed events are rejected.
- Durable account deletion uses a current password or fresh linked OAuth sign-in (five minutes), account-bound explicit confirmation, persisted intent and a worker lease. New work is rejected while pending. Checkout expiration and idempotent subscription cancellation happen before the reviewed data/key cascade. Failures retain retryable state and customer mapping. Late events cannot restore access. Old sessions lose identity/access. The email-only DELETE endpoint now requires the new verified flow instead of bypassing it.
- Existing account-data and conversation-archive formats are preserved. Minimal completed deletion and webhook reconciliation identifiers are pruned after 90 days on the next successful existing maintenance run. Pending requests are not expired. Daily cron remains unchanged; no 15-minute unattended recovery promise is claimed.

## Migration and rollout

One additive ninth migration, `20261104180000_account_deletion`, adds the User deletion marker, independent AccountDeletion intent and Analytics cascade. The Analytics FK enforces new writes but is NOT VALID for historical rows, avoiding a deployment failure on old orphan telemetry. Audit those rows before validating the historical constraint. No old migration was changed or removed.

The health schema probe now includes the new User marker required by authentication; it still is not full migration-drift proof. Apply/review the migration through the normal approved release process before serving the new code against a database with only eight migrations. Old code is compatible with the additive columns/tables.

A fresh empty `manyone_v1_reconcile` database and non-admin `manyone_reconcile_app` role were prepared on the existing preview Neon branch/compute, without copying production application data into that database or creating another compute. Upload of its credentials and fresh preview-only app secrets to the new Vercel branch was rejected by automatic approval review because the earlier approval named only the old branch/database. Explicit approval for this new scope is pending; no workaround or credential transfer was performed after rejection. Do not run write-based deployed QA against an unverified database.

## Verification

- Frozen local coverage run: **1,195 passing tests / 122 files**; statements/lines 60.25%, branches 79.18%, functions 76.99%. Subsequent checkout-gate and health-column changes have targeted passing regressions and require final CI on the pushed head.
- Real local PostgreSQL + controlled local model HTTP tests: concurrency cap, quotas, replay, cancellation/failure isolation, ownership, persistence, export/restore and retired deletion denial. The old CI fixture that put six selections on one turn was corrected to separate reliability turns, preserving checks and adding ten concurrent requests racing for four slots.
- Desktop/mobile browser QA: persisted history/comparison/settings, four-model UI limit, direct deferred-route denial, public root/pricing/legal/support, confirmed deletion and logout; no console errors. Local runs use installed Chromium via an explicit executable-path override; CI retains its normal browser installation.
- The real deletion runner injects a task-owned PostgreSQL failure, verifies cascade rollback/pending denial, retries to completion, confirms old-session revocation and rejects late orphan analytics. Paid Stripe failures/reordering/idempotency and OAuth proof are unit-tested; real Google-only/paid sandbox journeys remain pending.
- Production build/type-check/lint pass using synthetic compile-only secrets; no fake OAuth proof is claimed. A restored local candidate database reports all nine migrations current. Before any production recovery serves traffic, reconcile current Stripe state and reapply deletion requests made after the recovery point; a successful local restore alone does not prove that operating procedure. A build scan checked 114 client assets with no synthetic server secrets found.
- Fresh production dependency audit: zero high/critical and one moderate package (Next.js cache advisories GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8). No `use cache`, `unstable_cache`, `cacheComponents` or rootParams usage was found in inspected app/lib/services/config, so the stated trigger patterns were not found. This is scoped applicability evidence, not a claim of zero vulnerabilities. No dependency major upgrade or audit threshold reduction was made.

## Remaining mandatory gates

Fresh public Google signup with two owner-controlled identities; real generations for two independent vendors and every exposed vendor; deployed persistence/personas/isolation/allowance proof; actual sandbox checkout-to-user, portal, failed payment, cancellation and paid deletion; a separately authorized legitimate live payment lifecycle; confirmed backup retention and production restore/key recovery; actual delivered alert/recipient, cron recovery bound and branch protections; final owner review and production deployment approval.

G01–G14 are not all passed. Keep both release flags false, do not merge solely because local tests pass, and do not open paid access or send invitations. Finish these bounded gates, then stop feature work; no additional providers, Teams or agents are hidden requirements.
