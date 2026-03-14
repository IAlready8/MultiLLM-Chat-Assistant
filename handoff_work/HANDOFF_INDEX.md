# Handoff Index

## Quick Start
- Release baseline: `main` at `57fa76861a7790f399586c27d297a0cb7e36951a`
- Release runtime tag: `handoff-baseline-2026-03-09` -> `8e9e49794a72b534dfd54138e4bdf73581c7fb1c`
- Production URL: `https://multi-llm-chat-assistant.vercel.app`
- Rollback reference: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Billing-ready status: complete
- Top 3 residual risks:
  - transitive dependency advisories remain open pending non-trivial version upgrades
  - external preview/deploy integrations still create optional PR noise
  - optional Python sidecar is implemented but not part of live core production proof
- Read first:
  - `ROADMAP.md`
  - `handoff_work/MASTER_REBUILD_SPEC.md`
  - `handoff_work/BUYER_OPERATOR_DELIVERY_BRIEF.md`
  - `handoff_work/RELEASE_STATUS.md`
  - `handoff_work/RELEASE_MANIFEST.md`
  - `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
  - `docs/OPERATOR_RUNBOOK.md`
  - `handoff_work/DEPLOYMENT_EVIDENCE.md`
  - `handoff_work/RESIDUAL_RISKS.md`

## Authority Chain
- `handoff_work/MASTER_REBUILD_SPEC.md`
  - single-file rebuild and recovery spec for the current baseline
- `handoff_work/RELEASE_STATUS.md`
  - current shipped state and release posture
- `handoff_work/RELEASE_MANIFEST.md`
  - exact baseline identifiers, proof references, CI gate set
- `handoff_work/BUYER_OPERATOR_DELIVERY_BRIEF.md`
  - executive/operator delivery summary from the final baseline
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
  - preview / production / rollback evidence summary
- `handoff_work/BILLING_EVIDENCE.md`
  - Stripe billing-ready state and evidence or pending reason
- `handoff_work/RESIDUAL_RISKS.md`
  - remaining non-blocking risks with owner and containment
- `handoff_work/ENV_INVENTORY.md`
  - env families and operational impact without exposing secrets
- `handoff_work/REMOTE_BRANCH_AUDIT.md`
  - non-destructive branch and PR cleanup audit
- `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
  - the only authoritative forward plan from the current baseline
- `docs/OPERATOR_RUNBOOK.md`
  - operator execution procedures

## Release Decision Model
- Technical handoff-ready:
  - docs and runbooks match shipped behavior
  - preview / production / rollback proof exists
  - handoff bundle is complete
  - residual risks are explicit
  - `main` is the release baseline
- Billing-ready:
  - Stripe checkout verified
  - portal verified
  - signed webhook verified
  - billing-enabled production verify and smoke executed

Billing-ready is tracked separately from technical handoff-ready.
