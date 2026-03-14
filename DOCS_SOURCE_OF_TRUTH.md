# Documentation Source Of Truth

## Authoritative Docs (Current)
- `README.md`: operator entry point, setup, scripts, deployment notes.
- `ROADMAP.md`: branch-control pointer for the active roadmap branch and current planning surfaces.
- `ARCHITECTURE.md`: runtime architecture and contracts.
- `docs/OPERATOR_RUNBOOK.md`: operator startup, verification, deploy, rollback, and incident procedures.
- `VERCEL_DEPLOYMENT.md`: proven Vercel deployment and promotion flow.
- `docs/DEPLOYMENT_GUIDE.md`: platform-agnostic deployment contract.
- `CLAUDE.md`: code-verified working guidance for coding agents.
- `PYTHON_INTEGRATION.md`: optional sidecar behavior and known limitations.
- `handoff_work/HANDOFF_INDEX.md`: operator/buyer handoff entrypoint.
- `handoff_work/MASTER_REBUILD_SPEC.md`: single-file rebuild specification for the current baseline.
- `handoff_work/RELEASE_STATUS.md`: shipped scope and handoff gate status.
- `handoff_work/DEPLOYMENT_EVIDENCE.md`: preview, production, rollback, and restore proof summary.
- `handoff_work/BILLING_EVIDENCE.md`: billing-ready state and pending/complete proof.
- `handoff_work/RESIDUAL_RISKS.md`: explicit non-blocking residual risks.
- `handoff_work/RELEASE_MANIFEST.md`: release identifiers and proof references.
- `handoff_work/ENV_INVENTORY.md`: env family inventory without secret values.

## Demoted / Historical
- `STATUS_UPDATE.md`: retained as historical context only.
  - Not a current status source.
- `COMPLETION_REPORT.md`: retained as historical context only.
  - Not an authoritative "done" signal.
  - See checklist-gated status instead.

## Completion Gate
Treat repository state as technically handoff-ready only when the current release evidence in:
- `handoff_work/RELEASE_STATUS.md`
- `handoff_work/RELEASE_MANIFEST.md`
- `handoff_work/DEPLOYMENT_EVIDENCE.md`
is internally consistent and supported by the linked proof.
Track billing readiness separately in `handoff_work/BILLING_EVIDENCE.md`.
