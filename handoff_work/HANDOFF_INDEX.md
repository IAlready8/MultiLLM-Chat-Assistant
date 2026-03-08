# Handoff Index

## Quick Start
- Release baseline: `main` (final closeout PR pending merge while this branch is open)
- Production URL: `https://multi-llm-chat-assistant.vercel.app`
- Rollback reference: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Billing-ready status: pending separate Stripe validation
- Top 3 residual risks:
  - transitive dependency advisories remain open pending non-trivial version upgrades
  - external preview/deploy integrations still create optional PR noise
  - optional Python sidecar is implemented but not part of live core production proof
- Read first:
  - `handoff_work/RELEASE_STATUS.md`
  - `handoff_work/RELEASE_MANIFEST.md`
  - `docs/OPERATOR_RUNBOOK.md`
  - `handoff_work/DEPLOYMENT_EVIDENCE.md`
  - `handoff_work/RESIDUAL_RISKS.md`

## Authority Chain
- `handoff_work/RELEASE_STATUS.md`
  - current shipped state and release posture
- `handoff_work/RELEASE_MANIFEST.md`
  - exact baseline identifiers, proof references, CI gate set
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
  - preview / production / rollback evidence summary
- `handoff_work/BILLING_EVIDENCE.md`
  - Stripe billing-ready state and evidence or pending reason
- `handoff_work/RESIDUAL_RISKS.md`
  - remaining non-blocking risks with owner and containment
- `handoff_work/ENV_INVENTORY.md`
  - env families and operational impact without exposing secrets
- `docs/OPERATOR_RUNBOOK.md`
  - operator execution procedures

## Release Decision Model
- Technical handoff-ready:
  - docs and runbooks match shipped behavior
  - preview / production / rollback proof exists
  - handoff bundle is complete
  - residual risks are explicit
  - `main` is the release baseline after the final closeout PR merges
- Billing-ready:
  - Stripe checkout verified
  - portal verified
  - signed webhook verified
  - billing-enabled production verify and smoke executed

Billing-ready is tracked separately from technical handoff-ready.
