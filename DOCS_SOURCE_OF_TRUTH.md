# Documentation Source Of Truth

## Authoritative Docs (Current)
- `README.md`: operator entry point, setup, scripts, deployment notes.
- `ARCHITECTURE.md`: runtime architecture and contracts.
- `CLAUDE.md`: code-verified working guidance for coding agents.
- `STATUS_UPDATE.md`: current repository status snapshot.
- `PYTHON_INTEGRATION.md`: optional sidecar behavior and known limitations.

## Demoted / Historical
- `COMPLETION_REPORT.md`: retained as historical context only.
  - Not an authoritative "done" signal.
  - See checklist-gated status instead.

## Completion Gate
Treat repository state as handoff-ready only when `CLOSURE_MASTER_CHECKLIST.md` pass gates are complete with evidence.
