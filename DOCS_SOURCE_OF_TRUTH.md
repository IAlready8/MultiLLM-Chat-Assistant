# Documentation Source Of Truth

## Authoritative Docs (Current)
- `README.md`: operator entry point, setup, scripts, deployment notes.
- `ARCHITECTURE.md`: runtime architecture and contracts.
- `docs/OPERATOR_RUNBOOK.md`: operator startup, verification, deploy, rollback, and incident procedures.
- `VERCEL_DEPLOYMENT.md`: proven Vercel deployment and promotion flow.
- `docs/DEPLOYMENT_GUIDE.md`: platform-agnostic deployment contract.
- `CLAUDE.md`: code-verified working guidance for coding agents.
- `STATUS_UPDATE.md`: current repository status snapshot.
- `PYTHON_INTEGRATION.md`: optional sidecar behavior and known limitations.
- `handoff_work/HANDOFF_INDEX.md`: operator/buyer handoff entrypoint.
- `handoff_work/RELEASE_STATUS.md`: shipped scope and handoff gate status.
- `handoff_work/DEPLOYMENT_EVIDENCE.md`: preview, production, rollback, and restore proof summary.
- `handoff_work/BILLING_EVIDENCE.md`: billing-ready state and pending/complete proof.
- `handoff_work/RESIDUAL_RISKS.md`: explicit non-blocking residual risks.
- `handoff_work/RELEASE_MANIFEST.md`: release identifiers and proof references.
- `handoff_work/ENV_INVENTORY.md`: env family inventory without secret values.

## Demoted / Historical
- `COMPLETION_REPORT.md`: retained as historical context only.
  - Not an authoritative "done" signal.
  - See checklist-gated status instead.

## Completion Gate
Treat repository state as technically handoff-ready only when `CLOSURE_MASTER_CHECKLIST.md` pass gates are complete with evidence.
Track billing readiness separately in `handoff_work/BILLING_EVIDENCE.md`.
