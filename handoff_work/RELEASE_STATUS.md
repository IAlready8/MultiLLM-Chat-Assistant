# Release Status

## Current State
- Repository baseline branch: `main`
- Repository baseline head: `c83a83736f0364df3f223399efda58b98c5f9e6e`
- Current closeout branch: merged from `codex/live-auth-cookie-fix-20260308` and `codex/final-handoff-stamp-20260309`
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

Removed from supported production scope:
- `/api/teams`

## Proven Operational State
- clean local install/build/test proof: complete
- protected preview deployment proof: complete
- production deployment proof: complete
- rollback and restore proof: complete
- `/api/health` truthfulness proof: complete
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
