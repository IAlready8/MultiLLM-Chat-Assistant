# Server-assembled model context and message pagination - September 11, 2026

Work branch: `codex/server-history-message-pagination-20260911`, based on
`f2d8e98` of `codex/production-completion-20260907`. This implements the
multi-chat portion of release gate 5: message pagination inside a long
conversation without losing model context or turn attribution. The full gate
remains open until other workspaces adopt it and runtime verification passes.

The supplied patch is integrated on `codex/production-completion-20260907`.
PR 161 remains the release vehicle; this does not authorize production promotion.

## Defects closed

1. Saved multi-model generations trusted the browser-supplied message array.
   Any conversation whose history was not fully loaded in the tab would send
   truncated context to the provider, silently and at full cost.
2. Loading a conversation returned every message with no bound. A long
   conversation grew the response, the client render and the request payload
   without limit.

## Contract

`POST /api/llm/stream` accepts two history modes.

- `history` absent or `"client"`: unchanged. The browser sends `messages`.
- `history: "server"`: the browser sends `provider`, `model`, `conversationId`,
  `requestId`, `turnId` and optional `instanceId`/`position`, and no `messages`.
  Sending both is rejected with `HISTORY_MODE_CONFLICT` (400) before any
  provider work. `/api/llm/chat` rejects server mode outright.

Server mode responses carry three headers:

| Header | Meaning |
| --- | --- |
| `X-Context-Included-Turns` | User turns sent to the model |
| `X-Context-Omitted-Turns` | Older user turns dropped for the model budget |
| `X-Context-Truncated` | Whether any earlier context was dropped |

`GET /api/conversations/[id]` is unchanged without query parameters, so
roundtable, pipeline and comparison keep the full-load behavior. With
`?messagesLimit=N` (1-50) and an optional opaque `before` cursor it returns the
newest N complete user turns plus `nextMessageCursor` and `pageTurns`.

## Ordering and grouping rules

A turn is one user message, every response linked to it by `turnId` including
regenerations saved later, and unlinked legacy assistant messages saved between
that user message and the next newer turn. Windows are keyed on
`(createdAt, id)` so they partition a conversation with no overlap and no gap.

Context assembly ends at the target user turn. Responses to that turn and every
later turn are excluded, so regenerating an older answer sees what the original
request saw. When persisted history exceeds the model budget, whole oldest turns
are dropped and counted; a turn is never split between its user message and its
answer. The target turn is always retained, so an oversized prompt fails the
existing model contract with `CONTEXT_BUDGET_EXCEEDED` instead of silently
losing the user's message.

Budgeting reuses the model contract's conservative UTF-8 byte estimate through
shared `messageContextCost` and `contextInputLimit` helpers, and keeps the same
200-message provider ceiling the request schema already enforced.

Replay identity is unchanged: `beginGeneration` still hashes the client's
request intent, not the assembled context snapshot, so a transport retry of a
completed generation replays the saved response rather than dispatching a second
paid request, even after the conversation has grown.

## Bounds and failure behavior

- Page size 1-50 turns; cursor at most 512 bytes; invalid values return 400
  before any conversation read.
- Any single window is capped at 2,000 messages and returns
  `HISTORY_PAGE_TOO_LARGE` (413) rather than loading without limit.
- Context scanning stops after 200 turns, which cannot yield more context
  because each retained turn costs at least its user message.
- Ownership is checked before history loading, provider dispatch and generation
  reservation. A denied request performs no provider call.
- In the browser, a failed older page leaves loaded history in place and offers
  a retry; a late page is discarded if the user switched conversations; scroll
  position is preserved when older turns are prepended.

## Verification executed on this branch

Node 22.22.2, npm 10.9.7.

- Strict typecheck: passed.
- ESLint `--max-warnings=0`: passed.
- Vitest: 666 tests in 85 files passed, up from the 645/84 baseline reproduced
  on `f2d8e98` in the same environment.
- Coverage gates passed: 46.31% lines/statements, 76.28% branches, 73.94%
  functions, against unchanged 30/60/55 thresholds.
- Production build with the CI fixture configuration: passed.
- Secret and generated-artifact hygiene: passed.
- Vercel proxy and native function compatibility: passed.

New behavioral coverage in `test/conversation-context.test.ts` uses a fake
Prisma that rejects any query operator it does not implement:

- A 60-turn conversation with a preamble, legacy messages, a failed answer and a
  second model produces exactly the history the previous browser algorithm
  produced from a fully loaded conversation.
- Regeneration of an older turn excludes later turns and honors a newer
  regeneration of an earlier turn.
- Budget pressure drops whole oldest turns and reports the omitted count.
- The 200-message ceiling holds without splitting a turn.
- An oversized target turn is retained rather than dropped.
- Cross-account access returns 404; an unsaved turn returns 409.
- Paging 45 turns covers every message exactly once, in the same order as a
  full load, with regenerations attached to their original turn.

`scripts/test-generation-flow.mjs` gained a server-history and pagination
fixture on a third isolated account, so the existing owner quota and history
assertions are unchanged. It asserts that the model receives the oldest
persisted turn and earlier answers the browser never sent, that a stale
browser-supplied history is rejected, that a denied server-history request
dispatches no provider call, and that message pages neither duplicate nor skip
turns nor split a turn from its responses.

## Not verified here

- The native PostgreSQL matrix, authenticated browser QA and the deployed
  preview were not executed in this environment: `binaries.prisma.sh` is not
  reachable, so `prisma migrate deploy` cannot run. The new integration
  assertions are unexecuted until CI runs them.
- No schema change was required, so no migration was added.
- Live provider, Stripe and Google sign-in behavior remains unverified, as in
  the September 9 and 10 handoffs.

## Integration review

The supplied ZIP checksum matched its SHA-256 file. Its application code was
integrated directly, without executing the bundled installer or its rollback
commands. The local checkout was reconciled to the published `f2d8e98` tree
before final validation, preserving the newer OAuth and safe-logging changes.

A regression found during review was fixed: a failed older-page request must
not show an error in a newly selected conversation. A UI test now exercises
starting a new chat while the old page request is pending.

The authoring results above remain attributed to the supplied package. Native
PostgreSQL and authenticated browser integration must pass on the published
integration commit; a successful build alone is not that evidence.

## Remaining workspace adoption

- Roundtable, pipeline and comparison still load whole conversations and still
  send browser-built history. They should move to server mode and paged loads
  once this lands.
- The remaining release gates are unchanged: Google OAuth callback
  registration, password recovery and verified email change, Stripe plan
  configuration, live provider matrix, and the Vitest upgrade behind real
  coverage improvement.
