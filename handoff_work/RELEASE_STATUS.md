# Release Status

## Current State
- Repository baseline branch: `main`
- Current closeout branch: `codex/live-auth-cookie-fix-20260308`
- Technical handoff status: ready pending final PR checks
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
