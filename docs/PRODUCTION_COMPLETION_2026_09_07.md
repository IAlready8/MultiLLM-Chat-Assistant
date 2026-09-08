# Production completion engineering handoff

Historical checkpoint. The [September 8 completion map](PRODUCTION_COMPLETION_2026_09_08.md) supersedes its publishing, integration, quota, recovery and release-status limitations.

Baseline: `main` at `9818849639be29b5f8b25c5de9e1709f37ae91d5`.
Work branch: `codex/production-completion-20260907`.

The checkout was clean before work began. This branch reuses the reviewed runtime/dependency work in [PR #154](https://github.com/IAlready8/MultiLLM-Chat-Assistant/pull/154) and the subscription reconciliation work in [PR #146](https://github.com/IAlready8/MultiLLM-Chat-Assistant/pull/146), then integrates the changes below. Those source branches are preserved.

## Implemented phases

### Provider execution and orchestration

Chat, NDJSON streaming, and native batch orchestration share validation, credentials, endpoint checks, rate limits, error normalization and provider adapters. Native batches execute with three workers, return results in request order, and retain successful responses when another provider fails. They do not forward session cookies through an internal HTTP loop.

Provider calls receive cancellation signals and bounded timeouts. The route deadline leaves time to persist a terminal generation state. SSE and NDJSON reject malformed frames, in-band errors, empty responses and premature connection closure. Raw upstream error bodies are not exposed to users.

An explicitly configured Python sidecar remains optional. Its response identity/shape is checked, and a failed request is not automatically dispatched again through another backend. The sidecar still uses its own server-managed provider configuration and needs separate deployment validation.

### Durable multi-chat

The frontend saves a user turn before dispatching model requests. Each saved request contains `conversationId`, a UUID `turnId`, a UUID `requestId`, model instance identity, and its selected position. The server checks ownership and the saved user turn, then reserves an assistant message and a unique generation record in one transaction.

Completed request retries replay saved content. Reused IDs with different input, and retries of already-running/failed/canceled generations, return conflicts without another provider call. Explicit regeneration uses a new request ID and preserves the original response. Terminal generation state, content and usage commit before `done` is sent. Cancellation preserves received content when the server can complete its transaction.

Responses reload by user turn and model position. Regenerated alternatives stay beside their original turn, and model context retains earlier answers across reloads instead of moving regenerated content after later prompts. Each model receives its own completed history, including the latest regenerated alternative. The Stop control aborts all current model requests, and failed saves retain the unsent prompt.

### Billing and usage

Stripe signatures are required. Customer transaction locks serialize reconciliation and checkout creation. Webhook event IDs and entitlement changes share a transaction, so a failed reconciliation remains retryable. Reconciliation retrieves the latest subscription, validates ownership/customer identity, uses subscription-item period dates, grants Pro only for active/trialing configured prices, and ignores cancellation of an older subscription when a newer subscription is recorded.

Checkout reuses suitable open sessions and uses Stripe idempotency keys. Account sessions refresh tier from the database. Stripe calls have bounded timeouts; no blind SDK retries are enabled.

Saved generations persist token usage with its source. OpenAI, Anthropic, Gemini, and Ollama streaming adapters normalize supplied usage; compatible adapters consume usage when the upstream stream includes it. Missing/invalid usage is explicitly estimated. No invented dollar price is returned: unavailable cost is `null`. This is not yet an invoice-grade cost ledger or an enforced quota system.

## Migration and release contract

Two additive migrations are required **before deploying this application version**:

1. `20260809000000_harden_stripe_subscription_state`
2. `20260907000000_durable_generations`

They add subscription status/cancellation fields, message identity/status fields, generation records, webhook event records, indexes and foreign keys. Existing messages default to `complete`. No tables or existing data are reset or dropped.

Use the repository's established deployment verifier against the intended staging database first:

```bash
npm ci
npm run type-check
npm run lint
npm run test:run
npm run build
npm run verify:prod -- --apply-migrations
```

The verifier uses Prisma's production migration workflow. Confirm the target database and backup/restore procedure through the existing operator runbook. Do not use `migrate reset` or `db push` for this release. No production migration, merge, alias promotion or deployment was performed during this work.

## Reproducible integration check

`scripts/test-generation-flow.mjs` exercises real NextAuth credentials, owned database records and application HTTP routes. Only the external Ollama model service is controlled. The script seeds uniquely named test users and removes only its own records afterward. It rejects nonlocal/non-test database URLs and requires explicit test opt-in.

With a migrated disposable local PostgreSQL database and a running development server:

```bash
GENERATION_INTEGRATION_TEST=true node scripts/test-generation-flow.mjs
```

`DATABASE_URL` must reference that test database. `GENERATION_TEST_BASE_URL` defaults to `http://localhost:3000`. The runner binds local port 11434 for its controlled provider. Development mode is intentional: production rejects local Ollama endpoints. CI's existing PostgreSQL service runs this check after production smoke checks.

The runner covers parallel responses, isolated provider failure, token usage, reload order, duplicate requests/user turns, cross-account access denial, regeneration, interrupted streams, cancellation, and usage-record uniqueness.

## Execution evidence and limitations

- The repository started with 441 passing tests. The final run passed 525 tests in 66 files, standalone TypeScript checking, ESLint with zero warnings, and the webpack production build on Node 22.22.0.
- Coverage gates passed with approximately 42% line coverage, 74% branch coverage and 70% function coverage. These figures are coverage measurements, not product-completion percentages.
- The production dependency audit returned zero vulnerabilities. Tracked-secret, generated-artifact and Git whitespace checks passed.
- The production server was started and exercised over HTTP: sign-in HTML and JS assets loaded, protected pages redirected, unauthenticated conversation/LLM calls were denied, unsigned webhooks were rejected, and database degradation was reported without exposing credentials.
- All three migration SQL files ran in an isolated PostgreSQL engine. Assertions verified legacy content preservation, message uniqueness, generation foreign keys, webhook-marker rollback and account-deletion cascades. This does not substitute for native PostgreSQL `prisma migrate deploy` validation.
- A serial authenticated HTTP run passed real credential login, conversation creation, successful and failed provider response persistence, provider token reporting, reload order, completed-request replay, conflicting-request denial and cross-account GET/PUT denial. It exposed a DELETE path returning 500 for another user's conversation. That defect now returns not-found without deleting records and has an executed service regression test.
- The full concurrent HTTP run hit the lightweight database socket multiplexer’s prepared-statement limitations. The subsequent serial run was interrupted by the environment's local-network approval cancellation. The complete integration runner has not passed and is not reported as an end-to-end success.
- React interaction tests cover save-before-dispatch, duplicate submit prevention, partial provider failure, regeneration, failed-save prompt preservation and cancellation. The cloud browser could inspect the existing deployed sign-in page, but local browser access was blocked; the modified authenticated UI has not received full browser QA.
- The latest inspected Vercel attempt failed at resource provisioning before producing application build logs. This branch was not deployed.
- Automatic approval review rejected pushing this branch to `IAlready8/MultiLLM-Chat-Assistant`, citing transmission of potentially sensitive repository contents without explicit push/destination authorization. Changes are committed locally. No workaround, remote branch write or draft PR was attempted after that rejection; remote CI awaits authorization.

## Remaining release work

- Complete the live provider matrix with authorized test credentials, including long context and provider-specific reasoning parameters. Tool calling, attachments/multimodal input and structured output remain separate product work.
- Validate the integration runner on native PostgreSQL and run authenticated browser QA of this exact branch. The lightweight local PostgreSQL socket multiplexer has prepared-statement limitations under concurrent connections; do not treat it as production concurrency evidence.
- Exercise Stripe test-mode checkout, signed webhook redelivery, renewal, failed payment and portal cancellation against staging. Unit tests are not payment-network proof.
- Define and enforce product quotas/entitlements and maintain a versioned model-price catalog before claiming accurate monetary accounting.
- Add durable job recovery/checkpointing for process termination. Normal stream cancellation is persisted, but a killed process can leave a running reservation requiring explicit regeneration.
- Finish persistence/UX validation of secondary workspaces (roundtable, pipeline, goals/personas), account recovery/lifecycle and large-history pagination.
- Resolve Vercel provisioning failure, then apply staging migrations and verify the deployed commit, auth configuration, callbacks, browser console and critical flows. Keep production promotion separate from preview creation.

## Provider protocol references

- [OpenAI streamed usage](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events/)
- [Anthropic stream lifecycle and errors](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini generation response fields](https://ai.google.dev/api/generate-content)
- [Ollama final usage fields](https://docs.ollama.com/api/usage)
- [Stripe webhook handling](https://docs.stripe.com/webhooks)
