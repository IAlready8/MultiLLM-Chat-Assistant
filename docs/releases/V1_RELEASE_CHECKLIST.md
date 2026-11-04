# MultiLLM V1 candidate evidence

Prepared November 4, 2026 (America/Toronto). Status: **NOT RELEASE READY**. This is the execution record for the owner's finite BYOK release plan, not a commercial launch approval.

## Candidate scope and approved decisions

The candidate starts from `3c4e3b52223b7af803e31251ff9d1bf41f447b44` on `release/v1-candidate`. The environment initially contained the older `5dd6b24`; `origin/main` was fetched and fast-forwarded before edits. No production source, configuration, database or financial state was changed.

The owner approved CAD 19/month, Free 50 and Pro 2,000 attempted generations per UTC calendar month, four selected models, paid-through access after renewal cancellation, and no Enterprise sales. `lib/release-offer.ts` is the shared offer. Explicit production Free/Pro configuration must match it; all tier caps must be finite. The retained Enterprise example cap is zero. Policies are drafted separately in [V1_POLICY_DRAFT.md](V1_POLICY_DRAFT.md).

Implemented preparation:

- R01: missing/malformed/unlimited production quota configuration fails closed; current DB entitlements and the existing advisory-lock ledger are preserved.
- R02 (billing/checkout portion): replace weekly guidance with exact units, cap, BYOK cost separation and reset semantics. Verify the Stripe price is CAD 19 monthly before checkout; suppress Enterprise sales. Public pricing remains pending M1/M5.
- R07: API-key validation uses per-user distributed throttling, retains bounded parsing, and returns sanitized 429/503 responses with Retry-After.
- R08/R16: immutable release gates reject direct Jev/decision/Teams/Goals handlers; deferred page layouts and proxy reject Roundtable/Pipeline/Goal Hub. Remove their entry points and Jev settings without deleting source/data. Preserve their implementation tests separately from real release-gate tests.
- R09: production native orchestration ignores PYTHON_CORE_URL; production health does not contact a sidecar.
- R10: production candidate shortlist is OpenAI, Anthropic and Google. Settings, selector, runtime and health share eligibility. Other adapters remain available for development/compatibility. The shortlist is not a claim of successful real-vendor validation.
- R14: invalid production billing origins fail before any Stripe customer/session operation.
- R18 (new observed P1 policy/accounting defect): providerFetch previously defaulted to two automatic retries even for generation POSTs, potentially billing multiple upstream attempts against one quota reservation. Mutating provider requests now force zero retries even when environment/caller configuration requests five. Safe read-only probes retain bounded retries. Unit and real HTTP integration tests assert dispatch counts.
- M4 comparison cap: cap orchestration batches and UI selections at four; serialize admission to a saved turn across independent streaming requests. Reusing position zero cannot admit a fifth distinct selection. Saved replay remains free and explicit regeneration within a slot remains possible.

There are no schema migrations in this candidate. The Node pin advances from 22.22.0 to 22.22.2 to satisfy the locked jsdom dependency's declared engine floor; no dependency upgrade was added.

## Independently rechecked external baseline

- Production deployment: `dpl_8dPuvVSipL3fZaFD7HmBffHC2tDq`, READY, source SHA matches the baseline.
- Live health on November 4: HTTP 200, healthy, same SHA, version `0.2.0-private-pilot.3`, distributed PostgreSQL limiter connected; cache in memory; sidecar disabled. Health's schema label remains a partial probe.
- [CI run 41308834828](https://github.com/IAlready8/MultiLLM-Chat-Assistant/actions/runs/41308834828): Quality Checks, Coverage, Security Audit, Redis smoke, PostgreSQL smoke and aggregate smoke all successful. This proves the baseline, not this candidate's CI.
- Recent Vercel records: 10 ERROR / 15 records. Failed preview `dpl_2Z5ErevoZ5XHWX2C4gpXNJ6wrw96` reports `BUILD_FAILED: Resource provisioning failed`; build events returned an empty list. A different historical preview is READY. The first candidate revision cba666d also reached READY as dpl_8pSRmGiL7LPHfWm3f3V8nFnF8aGJ; the subsequent no-paid-retry fix requires its own final preview/CI evidence. Preview migration isolation remains unverified.
- Stripe account `acct_1QQ7I0GLN5ajQKkQ` is live mode; no sandbox was connected. Existing active CAD 19/month price: `price_1SzOPaGLN5ajQKkQ1q9ElHWX`. This does not establish the app's configured price ID, product, taxes or purchase lifecycle.
- Enabled correct webhook `we_1SzOaAGLN5ajQKkQuBxIOYtZ` points to `/api/webhooks/stripe`, subscribes to checkout/subscription events and invoice.payment_succeeded, and does not list invoice.payment_failed. A second enabled webhook `we_1SzOVFGLN5ajQKkQ8NsNbGGn` points to `/` with invoice.paid/payment_failed events. Review the intended event subscriptions and retire the incorrect destination only through an approved configuration change. No endpoint was modified.
- Stripe business profile: website matches the app, but business name, legal company name and support contact are absent.
- Neon production project `multi-llm-prod`, main branch: eight distinct migration names and checksums match source, all finished with no rollback. There are three completed entries for password_version with the same checksum; they were recorded, not deleted or rewritten.
- Read-only catalog comparison: all 110 application columns, 34 indexes and 31 constraints match a fresh database migrated from source. Production additionally contains extension views and an unrelated sample table. The UserRole enum also matches source. No schema pruning was done. This comparison does not prove production backup restoration or data invariants.
- Neon project history retention reports 21,600 seconds (six hours). A production restore has not been attempted. Separate backups and key-recovery custody remain unknown.
- Read-only production generation aggregate: zero running and zero abandoned-over-15-minute records at inspection. This snapshot does not prove a recovery-time bound. Source cron remains daily; on-demand lease recovery is tested locally.
- GitHub branch-protection read returned 403, Resource not accessible by integration. Actual required checks/rules remain pending appropriate access.

## Local evidence and reproduction

Logs are under `/tmp/multillm-v1-evidence/`; these are environment artifacts, not durable production evidence. Test databases and synthetic secrets are disposable local resources. Never reuse them for deployed environments.

Baseline checks used Node 22.22.2 / npm 11.9.0:

| Check | Result / scope |
| --- | --- |
| Lockfile install | PASS, npm ci and Prisma generation; writable npm/Prisma caches required in this sandbox |
| Type-check / lint | PASS |
| Coverage | PASS, 940 tests / 102 files; statements 49.51%, branches 78.28%, functions 75.17%, lines 49.51% |
| Production build | PASS in compile-only profile; the environment's unmatched GitHub client ID was omitted for this profile, not supplied a fake secret |
| Production/full dependency audits | PASS at repository thresholds; no production advisories |
| PostgreSQL migrations | PASS, all eight applied to disposable local PostgreSQL 16 |
| Existing authenticated journey | PASS, real app/auth/database against a controlled local model API. This is not M1 real-vendor or Google OAuth proof |

Candidate checks pass: 1,008 tests / 104 files; coverage statements/lines 50.07%, branches 78.20%, functions 75.25%; type-check; lint; production build; and the expanded authenticated integration runner. Production PostgreSQL smoke passes 19 checks with zero failures and 13 explicitly skipped authenticated/external checks. Those skips do not satisfy the corresponding release gates. The runner proves ten separate requests with one remaining unit produce one dispatch/nine quota rejections; ten saved requests reusing position zero admit four models and reject six before dispatch. It also checks stream cancellation/failure isolation, persistent reload, replay, ownership, export/restore and old-session denial after database deletion. It does not implement or validate self-service account deletion.

The current full-tree dependency review reports 57 advisories: 17 high, 40 moderate, zero critical. The repository full-tree gate rejects critical advisories only; passing it does not mean zero high findings. Every reported high package path is marked dev=true in the lockfile (including Vercel CLI, ESLint and their dependencies); the candidate production-only audit reports zero vulnerabilities; applicability/mitigation remains part of G12, and no major upgrade or threshold reduction was performed. Production-only audit remains a separate blocking high/critical check.

A local pg_dump/pg_restore into a separate disposable target completed and `prisma migrate status` reported current. This verifies the local restoration procedure only.

Run the documented repository commands with Node `.nvmrc`, the actual lockfile and an isolated migrated database. For integration, use `GENERATION_INTEGRATION_TEST=true`, a loopback `GENERATION_TEST_BASE_URL`, `LLM_MONTHLY_REQUEST_LIMITS={"FREE":8,"PRO":100,"ENTERPRISE":100}` and `node scripts/test-generation-flow.mjs` against a development server. The runner rejects non-local/non-test databases. Production build/smoke require explicit approved limits `{"FREE":50,"PRO":2000,"ENTERPRISE":0}` and the existing PostgreSQL limiter configuration. Do not repoint test commands at production.

## Mandatory release gates

| Gate | Current state | Evidence still needed |
| --- | --- | --- |
| G01 Build | PENDING final CI | Local checks recorded; required CI green on the candidate SHA |
| G02 Revision | PENDING | Approved candidate preview/deployed SHA and configuration evidence |
| G03 Signup | PENDING | Fresh Google identity outside test-user list and repeat login |
| G04 Isolation | PARTIAL | Local two-account denial passes; actual Google/cross-browser candidate journey pending |
| G05 Real AI | PENDING | Two independent vendors; every advertised vendor separately; owner-held keys, explicit budget |
| G06 Reliability | PARTIAL | Controlled local endpoint passes; real-vendor cancel/timeout/failure behavior pending |
| G07 History/personas | PARTIAL | Local persistence passes; actual candidate second-browser/persona workflow pending |
| G08 Quota | PARTIAL | Local configuration, entitlement, boundary and real PostgreSQL races pass; deployed approved config and candidate UI proof pending |
| G09 Billing | PENDING | Sandbox checkout-to-account lifecycle and legitimate approved live evidence; no financial action authorized by a mere credential-access reply |
| G10 Deletion | PENDING | M6 fresh-identity, durable self-service workflow with billing/DB retry proof |
| G11 Public promise | PENDING | M5 public root/pricing/legal/support after M1 proof; truthful final operating facts |
| G12 Security | PARTIAL | Local bounds/throttles/gates/audit checks; real key custody/bundle/log review and candidate review pending |
| G13 Operations | PARTIAL | Production migrations/catalog inspected, local restore verified; actual production recovery/backup, alerts/recipient, cron logs, READY candidate preview and branch policy pending |
| G14 Release review | PENDING | All mandatory evidence, named operator/private support contact, zero open release blockers |

## Bounded next work

1. Bind owner-held provider test keys securely, supply two real Google test identities, and specify a provider-test budget. The owner's YES authorized access, but supplied no secret bindings, identities or numerical budget. Do not substitute customers' keys or manufacture OAuth success.
2. Execute M1 with two actual vendor streams, cancellation/sibling failure, second-browser persistence and A/B denial. Fix only demonstrated failures before expanding commercial implementation.
3. Finish public/legal surfaces and durable deletion after the core is proved. Use the delegated policy draft, actual business identity/private contact and confirmed operating facts; do not publish placeholders.
4. Connect a Stripe sandbox, run the actual checkout/portal/webhook lifecycle, then prepare any necessary live configuration/transaction for explicit approval and budget. Existing live price/webhook records are not lifecycle evidence.
5. Finish ops evidence; prepare a concrete final candidate. No merge, production deployment, production migration, configuration change, live charge/refund or customer message was performed in this execution.

Stop development after G01–G14 pass. No Teams, routing agents, new providers, infrastructure rewrite or major dependency upgrades are hidden prerequisites.
