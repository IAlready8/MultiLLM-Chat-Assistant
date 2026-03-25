# Roadmap Control Surface

This file exists only to anchor Step 1 of the locked plan.

## Baseline Freeze
- Stable release branch: `main`
- Stable release head at branch start: `b1afac3f979956aa99a238d7bf5a73932f0dd366`
- Current active roadmap branch: `codex/security-posture-step9-20260325`

## Current Step Lock
- Step 2 through Step 9 decisions are locked in:
  - `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
  - `docs/RELIABILITY_SLOS.md`
- Use that file for the exact ICP, exact use case, positioning rationale, primary KPI definition, scope-cut rules, activation sequence, and workflow telemetry contract.

## Authoritative Surfaces
- Forward plan:
  - `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
- Reliability contract:
  - `docs/RELIABILITY_SLOS.md`
- Security posture:
  - `docs/SECURITY_POSTURE.md`
  - `docs/THREAT_MODEL.md`
  - `docs/SECRET_ROTATION.md`
  - `docs/BACKUP_RESTORE_PROOF.md`
- Rebuild and recovery contract:
  - `handoff_work/MASTER_REBUILD_SPEC.md`
- Current shipped baseline and acceptance posture:
  - `handoff_work/RELEASE_STATUS.md`
  - `handoff_work/RELEASE_MANIFEST.md`

## Working Rules
- keep `main` read-only for normal development
- keep one active roadmap branch at a time
- do not create sub-branches from the active roadmap branch
- do not treat this file as a second roadmap narrative
- if branch focus changes, update this file and the authoritative surfaces above in the same commit

## Historical Note
- older roadmap/status trackers are historical only
- `STATUS_UPDATE.md` and `COMPLETION_REPORT.md` are preserved as snapshots, not current truth
