# Branch Scorecard — 2026-06-09

## Purpose

This document captures the surgical branch/readiness audit requested on
2026-06-09. It records the branch inventory visible from this checkout, the
integration-baseline recommendation, diff/subsystem impact, local quality gate
results, and the remaining plan checklist.

## Scope And Limits

- Local checkout path: `/workspace/MultiLLM-Chat-Assistant`
- Current branch: `work`
- Local HEAD: `2384c76bbc88b35e08f81558edd7e41008678fa4`
- Local HEAD subject: `fix: support python 3.14 setup dependencies (#113)`
- Documented release baseline: `57fa76861a7790f399586c27d297a0cb7e36951a`
- Remote audit status: blocked. Adding/fetching `origin` from
  `https://github.com/IAlready8/MultiLLM-Chat-Assistant.git` failed because the
  environment has no non-interactive GitHub credentials.

Because the remote fetch was blocked, this scorecard is authoritative for the
current local checkout only. It does not prove that no newer private GitHub
branches exist outside this checkout.

## Branch Inventory

| Branch | Type | Latest Commit | Updated | Latest Subject | Rank |
| --- | --- | --- | --- | --- | --- |
| `work` | local | `2384c76` | 2026-05-24 10:51:31 -0400 | `fix: support python 3.14 setup dependencies (#113)` | 1 |

## Integration Baseline Recommendation

Use `work` as the current integration baseline for this local checkout.

Rationale:

1. `work` is the only branch visible locally.
2. `work` is 79 commits ahead of the documented release baseline and 0 commits
   behind it.
3. Local quality gates pass when the production-build environment contract is
   provided.
4. The latest change is low-risk dependency compatibility work for Python setup,
   not an invasive feature change.

## Ahead / Behind

Compared against documented release baseline
`57fa76861a7790f399586c27d297a0cb7e36951a`:

| Branch | Ahead | Behind | Interpretation |
| --- | ---: | ---: | --- |
| `work` | 79 | 0 | Local branch contains all known release-baseline history plus post-baseline work. |

## Diff Size

Compared against documented release baseline
`57fa76861a7790f399586c27d297a0cb7e36951a`:

| Metric | Value |
| --- | ---: |
| Files changed | 112 |
| Insertions | 9,513 |
| Deletions | 2,181 |

Latest commit only:

| Metric | Value |
| --- | ---: |
| Files changed | 1 |
| Insertions | 2 |
| Deletions | 2 |

## Touched Subsystems Since Baseline

| Subsystem | Files Changed | Meaning |
| --- | ---: | --- |
| `app/` | 26 | Product pages, API routes, activation, analytics, billing, comparison, health, LLM endpoints. |
| `test/` | 20 | Expanded route, service, auth, billing, analytics, cache, and activation coverage. |
| `lib/` | 16 | Runtime/provider helpers, model catalog, cache, auth, security, telemetry support. |
| `docs/` | 12 | Reliability, security, acquisition, onboarding, runbook, and proof surfaces. |
| `scripts/` | 8 | Validation, reliability, smoke/build/release support. |
| `handoff_work/` | 7 | Release state, finish checklist, branch/status, buyer/operator handoff surfaces. |
| `components/` | 5 | Activation checklist and shared UI behavior. |
| `services/` | 3 | Conversation, persona/goal, and analytics service behavior. |

## Latest Commit Summary

The latest commit updates Python setup compatibility:

- `requirements.txt` changes `pydantic` from a fixed old version to
  `pydantic>=2.12,<3`.
- It also normalizes the file ending by preserving a final newline.

This is a maintenance change. It does not, by itself, prove product advancement,
but it lowers setup risk for newer Python environments.

## Quality Gate Results

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run type-check` | Pass |
| ESLint | `npm run lint` | Pass |
| Vitest | `npm run test:run` | Pass: 46 files, 311 tests |
| Production build | `DATABASE_URL='postgresql://placeholder' NEXTAUTH_SECRET='test-secret-placeholder' NEXTAUTH_URL='http://localhost:3000' API_KEY_ENCRYPTION_SEED='test-encryption-seed-placeholder' npm run build` | Pass |
| Remote fetch | `git fetch --all --prune` | Blocked: no non-interactive GitHub credentials |

## Current Project Status

Engineering and operational readiness are strong:

- Technical handoff is marked complete.
- Billing-ready status is marked complete.
- Release docs record no blockers for technical handoff closeout.
- CI release gates are documented as `Quality Checks` and `Smoke Tests`.
- Local type-check, lint, test, and env-backed production build pass in this
  checkout.

Market proof remains incomplete:

- Step 10 monetization behavior still needs real validation beyond Stripe wiring.
- Step 11 still requires real founder-led acquisition and onboarding runs.
- Retention, moat, and financial performance proof remain future work.

## Plan Checklist

| Status | Step | Current Read | Next Action |
| --- | ---: | --- | --- |
| Done | 1 | Baseline/focus surfaces exist. | Keep `main`/baseline discipline; do not reopen closeout. |
| Done | 2 | ICP and use case are locked. | Keep all work tied to independent AI consultants / boutique agencies. |
| Done | 3 | Primary KPI is Weekly Saved Brief Comparisons. | Keep analytics and UX centered on WSBC. |
| Done | 4 | Core workflow is scoped. | Keep settings → personas → multi-chat/comparison/roundtable → saved history → analytics prominent. |
| Done | 5 | Activation baseline exists. | Use activation state to guide first-run behavior. |
| Done | 6 | Core UX hardening rules exist. | Regression-test loading, empty, error, recovery, mobile, keyboard, and accessibility states. |
| Done | 7 | Workflow telemetry rules exist. | Keep telemetry first-party and tied to workflow impact. |
| Done | 8 | Reliability SLO/gate exists. | Run reliability gate before production-impacting changes. |
| Done | 9 | Security posture is marked complete. | Keep threat model, rotation, backup/restore, and incident docs current. |
| In progress | 10 | Billing telemetry exists; monetization behavior validation is not complete. | Validate plan screen, free-plan guidance threshold, upgrade path, portal path, and analytics events with real usage. |
| In progress | 11 | Acquisition prep exists; real user execution remains. | Run founder-led direct outbound and record real onboarding attempts. |
| Not started | 12 | Retention proof is not established. | Track repeat weekly saved brief comparisons after real users exist. |
| Not started | 13 | Moat proof is not established. | Identify one hard-to-replace advantage from real usage evidence. |
| Partial | 14 | Handoff materials exist; buyer diligence packaging can be tightened after user proof. | Package product story, architecture, proof, and transfer readiness once Steps 10-13 have evidence. |
| Not started | 15 | Financial performance is not proven. | Capture revenue, paid pilots, or equivalent commercial proof. |
| Deferred | 16 | Enterprise-specific features are correctly deferred. | Add only if demanded by target buyer evidence. |

## Surgical Next Steps

1. Do not start broad feature work.
2. If remote credentials become available, fetch all branches and regenerate this
   scorecard with remote branch comparisons.
3. Keep `work` as the local integration baseline unless a fetched remote branch
   proves newer and healthier.
4. Execute Step 10 validation with real billing-path behavior, not just Stripe
   wiring.
5. Execute Step 11 founder-led outbound with real ICP users.
6. Use retention and willingness-to-pay evidence to decide the next product
   change.

## Reproduction Commands

```bash
git branch -a -vv
git for-each-ref --sort=-committerdate refs/heads refs/remotes \
  --format='%(committerdate:iso8601)%09%(refname:short)%09%(objectname:short)%09%(subject)'
git rev-list --left-right --count 57fa76861a7790f399586c27d297a0cb7e36951a...HEAD
git diff --shortstat 57fa76861a7790f399586c27d297a0cb7e36951a..HEAD
git diff --name-only 57fa76861a7790f399586c27d297a0cb7e36951a..HEAD | awk -F/ '{print $1}' | sort | uniq -c | sort -nr
npm run type-check
npm run lint
npm run test:run
DATABASE_URL='postgresql://placeholder' \
NEXTAUTH_SECRET='test-secret-placeholder' \
NEXTAUTH_URL='http://localhost:3000' \
API_KEY_ENCRYPTION_SEED='test-encryption-seed-placeholder' \
npm run build
```
