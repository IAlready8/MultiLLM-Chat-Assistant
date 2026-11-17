# ManyOne finite V1 reconciliation

Baseline: main 5c7892674765e1f7ce84f7c8843fe0a0eb1ad06c.

Owner confirmed November 17 (Toronto): keep ManyOne and itsokialready8@gmail.com; the service is operated personally. The individual's full legal name is still unknown. Do not invent it or treat the product name as proof of operator identity. No new legal identity has been configured or published in this work.

This first focused change restores approved generation/billing boundaries while preserving the newer public pages, usage UI, export and CI work from main:

- Production rejects missing/malformed/unlimited tier limits and Free/Pro values inconsistent with the approved 50/2,000 allowance. Keep the existing PostgreSQL reservation ledger and advisory lock.
- Four-model cap applies in the UI, request positions, orchestration batches and serialized saved-turn admission. Reusing position zero cannot admit a fifth distinct model. Explicit regeneration in an existing slot remains possible.
- Production cannot select the optional sidecar, even with PYTHON_CORE_URL set. Development compatibility remains.
- Invalid billing origins fail before creating Stripe resources; production cannot fall back to localhost. Existing route throttles and billing/customer locks are retained.

No migration or dependency upgrade is required for this change. Missing production quota configuration will intentionally return 503: verify approved configuration before deploying. The example internal Enterprise cap is zero; Enterprise is not sold under this release plan.

Remaining reconciliation: deferred module UI/API gates, provider eligibility/health consistency, durable deletion intent and fresh OAuth proof, checkout/webhook deletion races, preview Stripe isolation, and approved legal/payment publication gates. Follow with separate focused changes rather than replacing current main with the stale #211 tree.

External proof still required: actual Google signup/two-account isolation, two independently tested provider vendors, sandbox billing/paid deletion, approved legitimate live billing evidence, real legal operator and verified support/retention policy, production restore/key recovery, delivered alert/recipient, cron recovery bound and branch protections. Provider-test authorization remains CAD 5 aggregate; this work dispatched no paid provider requests. No production change, merge, live purchase/refund or customer message is authorized by a passing local build alone.
