# Remote Branch Audit

## Scope
- Audit date: `2026-03-09`
- Baseline branch: `main`
- Baseline head: `c83a83736f0364df3f223399efda58b98c5f9e6e`
- This is a non-destructive audit only.

## Local Branches
- `main`
- `claude/upgrade-ci-cd-workflow`
- `codex/clean-install-proof-20260306`
- `codex/final-handoff-closeout-20260308`
- `codex/final-handoff-stamp-20260309`
- `codex/live-auth-cookie-fix-20260308`
- `codex/live-proof-closeout-20260308`
- `codex/main-superset-20260308`
- `codex/post-merge-audit-20260306`
- `codex/protected-main-push-20260302`
- `codex/protected-main-push-20260302-integration`
- `codex/protected-main-push-20260302-review-fixes`

## Remote Branches
- `IAlready8-.GitHub-instructions-update`
- `IAlready8-pa`
- `IAlready8-patch-1`
- `chore-next16-migration`
- `chore/deploy-refresh-20260220`
- `chore/stabilize-next16-runtime`
- `claude/create-codebase-docs-kP9Pl`
- `claude/create-project-documentation`
- `claude/fix-main-branch-tests`
- `claude/upgrade-ci-cd-workflow`
- `code-polish`
- `codex/final-handoff-closeout-20260308`
- `codex/final-handoff-stamp-20260309`
- `codex/live-auth-cookie-fix-20260308`
- `codex/live-proof-closeout-20260308`
- `codex/main-superset-20260308`
- `codex/post-merge-audit-20260306`
- `codex/protected-main-push-20260302`
- `codex/protected-main-push-20260302-review-fixes`
- `copilot/sub-pr-33`
- `copilot/sub-pr-33-again`
- `feat/performance-and-security-improvements`
- `fix/dependency-compatibility-and-testing`
- `fix/security-auth-hardening-merge`
- `main`
- `perf/button-polish`
- `prisma-config-error`

## Merged Into `main`
These branch tips are already contained in `main` and are strong deletion candidates after manual confirmation:
- `chore-next16-migration`
- `chore/deploy-refresh-20260220`
- `codex/final-handoff-closeout-20260308`
- `codex/final-handoff-stamp-20260309`
- `codex/live-auth-cookie-fix-20260308`
- `codex/live-proof-closeout-20260308`
- `codex/main-superset-20260308`
- `codex/post-merge-audit-20260306`
- `codex/protected-main-push-20260302`
- `feat/performance-and-security-improvements`
- `perf/button-polish`

## Unmerged From `main`
These branch tips are not ancestors of `main` and should not be deleted blindly:
- `IAlready8-.GitHub-instructions-update`
- `IAlready8-pa`
- `IAlready8-patch-1`
- `chore/stabilize-next16-runtime`
- `claude/create-codebase-docs-kP9Pl`
- `claude/create-project-documentation`
- `claude/fix-main-branch-tests`
- `claude/upgrade-ci-cd-workflow`
- `code-polish`
- `codex/protected-main-push-20260302-review-fixes`
- `copilot/sub-pr-33`
- `copilot/sub-pr-33-again`
- `fix/dependency-compatibility-and-testing`
- `fix/security-auth-hardening-merge`
- `prisma-config-error`

## Superseded By `main`
These branches appear operationally superseded by merged PRs `#39`, `#40`, `#41`, `#42`, and `#43`:
- `codex/final-handoff-closeout-20260308`
- `codex/live-auth-cookie-fix-20260308`
- `codex/live-proof-closeout-20260308`
- `codex/main-superset-20260308`
- `codex/post-merge-audit-20260306`
- `codex/protected-main-push-20260302`
- `codex/final-handoff-stamp-20260309`

## Recommended Deletion Candidates
High-confidence, merged, low-risk cleanup candidates:
- local: `codex/clean-install-proof-20260306`
- local: `codex/final-handoff-closeout-20260308`
- local: `codex/final-handoff-stamp-20260309`
- local: `codex/live-auth-cookie-fix-20260308`
- local: `codex/live-proof-closeout-20260308`
- local: `codex/main-superset-20260308`
- local: `codex/post-merge-audit-20260306`
- local: `codex/protected-main-push-20260302`
- local: `codex/protected-main-push-20260302-integration`
- remote: `codex/final-handoff-closeout-20260308`
- remote: `codex/final-handoff-stamp-20260309`
- remote: `codex/live-auth-cookie-fix-20260308`
- remote: `codex/live-proof-closeout-20260308`
- remote: `codex/main-superset-20260308`
- remote: `codex/post-merge-audit-20260306`
- remote: `codex/protected-main-push-20260302`

## Must Retain For Now
- `main`
- release tags `handoff-baseline-2026-03-08` and `handoff-baseline-2026-03-09`
- any branch with an open PR until the PR is explicitly closed or reviewed:
  - `IAlready8-pa` / PR `#36`
  - `IAlready8-.GitHub-instructions-update` / PR `#33`
  - `copilot/sub-pr-33` / PR `#34`
  - `copilot/sub-pr-33-again` / PR `#35`
  - `codex/protected-main-push-20260302-review-fixes` / PR `#31`
  - `claude/fix-main-branch-tests` / PR `#30`
  - `claude/upgrade-ci-cd-workflow` / PR `#28`
  - `claude/create-codebase-docs-kP9Pl` / PR `#21`
  - `claude/create-project-documentation` / PR `#19`
  - `fix/security-auth-hardening-merge` / PR `#18`

## PR References Worth Manual Review
- PR `#31` points at `codex/protected-main-push-20260302-review-fixes` and is likely superseded by later auth/health/handoff merges, but it is not merged and should be closed deliberately, not deleted blindly.
- PR `#28` points at `claude/upgrade-ci-cd-workflow` and was previously identified as not merge-safe as-is.
- PRs `#19`, `#21`, `#30`, `#33`, `#34`, `#35`, and `#36` are all non-baseline branches that should be triaged before deletion.

## Safe Cleanup Commands
Review first. Do not run blindly.

Delete merged local branches:
```bash
git branch -d codex/clean-install-proof-20260306 \
  codex/final-handoff-closeout-20260308 \
  codex/final-handoff-stamp-20260309 \
  codex/live-auth-cookie-fix-20260308 \
  codex/live-proof-closeout-20260308 \
  codex/main-superset-20260308 \
  codex/post-merge-audit-20260306 \
  codex/protected-main-push-20260302 \
  codex/protected-main-push-20260302-integration
```

Delete merged remote branches:
```bash
git push origin --delete \
  codex/final-handoff-closeout-20260308 \
  codex/final-handoff-stamp-20260309 \
  codex/live-auth-cookie-fix-20260308 \
  codex/live-proof-closeout-20260308 \
  codex/main-superset-20260308 \
  codex/post-merge-audit-20260306 \
  codex/protected-main-push-20260302
```

List open PR branches before deleting anything unmerged:
```bash
gh pr list --state open --limit 50
```
