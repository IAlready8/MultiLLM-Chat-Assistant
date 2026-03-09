# Post-Closeout Next Actions

## Buyer / Operator Delivery
- use `handoff_work/BUYER_OPERATOR_DELIVERY_BRIEF.md` as the executive/operator entrypoint
- use `handoff_work/HANDOFF_INDEX.md` as the full authority chain
- use `docs/OPERATOR_RUNBOOK.md` for deploy, verify, rollback, and incident operations

## Branch Cleanup
- use `handoff_work/REMOTE_BRANCH_AUDIT.md` before deleting any local or remote branch
- delete only merged, superseded branches after review
- close stale open PRs before deleting their source branches

## New Scoped Feature Work From `main`
- branch only from `main`
- keep new work isolated by feature or risk area
- preserve the release tag and handoff bundle as historical truth

## Maintenance / Hardening Work
- dependency advisory remediation
- CI / external preview noise cleanup
- optional Python sidecar hardening if explicitly brought into supported runtime scope
- selective stale branch and PR reduction after human review

## Explicitly Out Of Scope
- reopening release-closeout conclusions
- downgrading completed proof gates back to pending
- retroactive scope expansion on the finished baseline
- destructive branch deletion without review
- unplanned platform or product rewrites
