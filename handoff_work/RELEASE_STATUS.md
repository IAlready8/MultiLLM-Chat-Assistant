# Release Status

## Current State (refreshed 2026-10-31)

Sources: `git fetch origin main`, GitHub deployments and check-runs APIs. Every line
below is labelled. Nothing here is carried forward from an earlier status without
being re-checked.

### Verified on 2026-10-31
- Baseline branch `main`, head `5dd6b240c15412256f67b4208d0c3bb2556ed3af`
  (merge of PR #197).
- Latest GitHub `Production` deployment record: `5dd6b24`, created
  2026-10-28T11:55:11Z, status `success`.
- CI on `5dd6b24`: Quality Checks, Coverage, Security Audit, Smoke Tests (postgres),
  Smoke Tests (redis): all `success`.
- `package.json` version: `0.2.0-private-pilot.3`.
- Latest migration in the repository: `20261020180000_add_user_roles` (adds
  `User.role`). The code on `main` reads `User.role` and `User.passwordVersion`
  on every authenticated request.

### Not verified
- Whether production Neon (`multi-llm-prod`, branch `main`) has the
  `20261014133000_password_version` and `20261020180000_add_user_roles`
  migrations applied. No production database access was used. Check with
  `npx prisma migrate status` against production, or with the
  `checks.database.schema` field of `/api/health` once that change is deployed.
- Live `/api/health` response of the current production deployment.
- Live behaviour of Jev judging against the TypeSafe API (no key used).

### Blockers
- None known for the code on `main`. The production schema question above is
  open until checked.

### Historical baseline (2026-03 to 2026-05, not re-verified)
- Earlier baseline head `57fa76861a7790f399586c27d297a0cb7e36951a`, hardening PR
  `#45`. Technical handoff and billing gates were recorded complete then; see
  the gate sections below.

## Supported Scope
Core:
- home
- auth
- chat / stream / conversations
- provider settings / config
- goals
- personas
- analytics
- health

Optional:
- billing + Stripe webhook flow
- Python orchestration bridge
- API test page

Experimental:
- comparison
- pipeline
- AI roundtable
- admin pages/routes

Disabled by default / outside supported production scope:
- `/api/teams` remains present for internal experiments, but returns 404 unless
  `ENABLE_TEAMS_API=true` is explicitly set.

## Proven Operational State (historical, recorded before 2026-10)
- clean local install/build/test proof: complete
- protected preview deployment proof: complete
- production deployment proof: complete
- rollback and restore proof: complete
- `/api/health` truthfulness proof: complete
- fresh production deployment from current `main`: complete
- CI release gates on `main` at the time: `Quality Checks`, `Smoke Tests`
  (current required gates also include `Coverage` and `Security Audit`)

## Technical Handoff Gate (historical)
Technical handoff-ready requires:
- authoritative docs aligned to shipped behavior
- handoff bundle complete
- release manifest complete
- env inventory complete
- residual risks recorded
- final PR checks green

Technical handoff-ready gate status:
- complete on merged `main`
- final PR `#42` merged at `2026-03-09T02:15:42Z`
- required checks passed on hotfix head `709103a14efe930bb60294f2ece867ec99760888`

## Billing Gate (historical)
Billing-ready requires:
- Stripe checkout verified on deployed infra
- Stripe customer portal verified
- signed webhook verified
- billing-enabled verify and smoke run against production

Billing-ready gate status:
- complete on promoted production deployment `dpl_8PpkUKh3obH4r4oMur8knNyRQ5wu`
- checkout verified
- portal verified
- signed webhook verified
- billing-enabled production verify passed
- production smoke passed after the promoted auth fix

## References
- `handoff_work/HANDOFF_INDEX.md`
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
- `handoff_work/RELEASE_MANIFEST.md`
- `handoff_work/BILLING_EVIDENCE.md`
- `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
