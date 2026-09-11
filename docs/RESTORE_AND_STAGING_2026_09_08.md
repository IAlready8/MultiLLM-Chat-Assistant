# Archive restore and staging investigation

Continuation from PR #161 head `fad787e`. The earlier worktree's Git metadata was missing, so the published branch was recovered into a fresh clone; its old files were preserved.

## Implemented archive restore

Settings can decrypt an existing conversation archive locally and explicitly restore its conversations into the current authenticated account. The API accepts at most 3 MiB of JSON, 200 conversations and 2,000 messages. Strict schemas reject unknown ownership/billing fields, invalid states, duplicate IDs and orphan messages before writes.

The server derives new conversation/message identities scoped to the current user and archive contents. A PostgreSQL transaction and account advisory lock serialize concurrent restores. Repeating the same archive skips previously restored copies, including edited copies; original conversations are never overwritten. A deleted restored copy can be restored again. Importing a changed archive creates separate copies.

Turn identities are remapped consistently. Running responses become interrupted. Restore does not create generations, quota usage, subscriptions, provider configuration or billing records. The existing conversation schema is sufficient; no migration was added. The legacy history cache is invalidated after commit.

Unit tests cover identity isolation, replay, strict validation, authentication, body limits and rate limits. Native integration exercises concurrent restore/replay and checks that no generation or usage records are created. Chromium exercises decrypt, restore and repeat-restore through settings. Consult PR #161's current CI result for executed verification.

## Concrete infrastructure findings

Connected Neon access found project `multi-llm-prod` in the Vercel-managed organization. The project reports `owner.branches_limit = 10`; listing all current branches returned ten: `main` plus nine archived preview branches. Recent Neon archive/unarchive operations completed without failures. There is no branch for `codex/production-completion-20260907`.

This is a concrete obstacle to creating the missing preview database branch and a strong explanation for Vercel's pre-build resource-provisioning failure. It must be confirmed by a successful preview after freeing capacity; no application build change alone frees a database branch slot.

A specific cleanup candidate is `preview/agent/auth-production-guard-20260802`, ID `br-lucky-hat-aitp4zdg`: non-default, non-primary, archived since August 16. Deleting it removes that branch's database copy. It was not deleted: Neon's delete-branch operation explicitly requires user confirmation, and existing preview data has not been authorized for destruction. `main` must be preserved. An alternative is increasing the plan's branch allowance through the account owner.

After capacity is available: retry the preview, verify the newly created branch identity and configuration, apply repository migrations using Prisma's production migration workflow against that staging branch, then verify authenticated deployed routes, provider contracts, Redis/cron and mobile behavior. Do not apply these migrations to `main` as a substitute.

## Other blockers rechecked

- Stripe's connected account returned `UNAUTHORIZED` and requires reauthentication. No Stripe test credentials or approved pricing/allowance policy are available locally. No live account or payment mutation was attempted.
- Provider test credentials, staging database/Redis/cron secrets and a Vercel CLI token are absent from the local environment. Connected Vercel tools expose project/deployment metadata but no environment-variable or integration-resource mutation capability.
- npm's current Vercel CLI metadata reports version 59.11.7 still using Undici 5.29.0; current `@vercel/node` 12.0.1 reports Undici 5.28.4. A CLI upgrade alone is not a vulnerability fix. The existing application dependency versions were preserved. Fresh full-tree audit still reports one high and nine moderate development-tool findings; production findings remain separately checked by CI.
- PR #161 is open, mergeable and already marked ready for review. That status was preserved. Passing native CI does not justify merging while deployed staging is unavailable.

Background on preview branch retention: [Neon cleanup guidance](https://neon.com/docs/guides/vercel-branch-cleanup).
