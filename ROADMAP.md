# Roadmap Control Surface

This file exists only to anchor Step 1 of the locked plan.

## Baseline Freeze
- Stable release branch: `main`
- Stable release head at branch start: `57fa76861a7790f399586c27d297a0cb7e36951a`
- Current active roadmap branch: `codex/define-icp-use-case-step2-20260314`

## Step 2 Lock
- Exact ICP:
  - independent AI consultants and boutique agencies producing repeatable client deliverables with multiple LLM providers
- Exact use case:
  - run the same client brief through multiple providers and reusable personas, compare outputs side by side, keep the conversation history, and use the built-in analytics/admin surfaces to improve repeatability over time
- Why this product exists instead of generic ChatGPT / Claude use:
  - generic single-provider chat does not give the same multi-provider comparison, persona reuse, saved workflow history, and operator-level diagnostics in one controlled workspace
- Explicitly not the primary target:
  - broad enterprise collaboration
  - generic consumer chat
  - unspecialized "AI for everyone" positioning

## Authoritative Surfaces
- Forward plan:
  - `handoff_work/POST_CLOSEOUT_NEXT_ACTIONS.md`
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
