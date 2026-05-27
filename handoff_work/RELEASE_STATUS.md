# Release Status

## Current State
- Repository baseline branch: `main`
- Repository baseline head: `57fa76861a7790f399586c27d297a0cb7e36951a`
- Latest promoted hardening PR: `45`
- Technical handoff status: complete
- Billing-ready status: complete
- Blockers: none for technical handoff closeout

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

## Proven Operational State
- clean local install/build/test proof: complete
- protected preview deployment proof: complete
- production deployment proof: complete
- rollback and restore proof: complete
- `/api/health` truthfulness proof: complete
- fresh production deployment from current `main`: complete
- CI release gates on `main`: `Quality Checks`, `Smoke Tests`

## Technical Handoff Gate
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

## Billing Gate
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
