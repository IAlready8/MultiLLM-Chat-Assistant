# Account continuation

Continues from published `a264c36` on PR #161. The earlier local checkout was preserved; work resumed in an isolated worktree at that exact remote commit.

## Implemented

- Settings reads the current account profile from `/api/account/profile`. Name updates persist to the authenticated User row. The request schema rejects email, role, ID and other unknown fields. Email stays read-only; account-email changes and password recovery still need a verified identity workflow.
- `/api/account/export` creates a consistent PostgreSQL Repeatable Read snapshot of owned conversations and messages. Explicit column selection excludes provider configuration, credentials, account/session tokens and billing records. Exports are limited to three per 15 minutes using the shared distributed limiter.
- Export preflight bounds the database read to 500 conversations, 5,000 messages and 8 MiB of message text. Serialization also enforces 16 MiB. An oversized account receives 413, with no partial download.
- Settings encrypts the archive locally using the existing versioned PBKDF2/AES-GCM envelope, then downloads it. The same panel can open a saved archive locally as readable JSON with its password. This does not import records back into the account. Legacy local import rejects the new server archive format.
- Native CI integration now exercises profile persistence, rejected account-ID injection, owned history export and cross-account isolation. Unit/interaction tests cover validation, failed writes, consistent snapshot options, size limits and encrypted download failure states.

No schema migration or production configuration change is required for these features. They use the existing User, Conversation and Message tables.

## Remaining release gates

Vercel still reports `Resource provisioning failed` before application build. The Vercel investigation workflow confirmed that deployment failure remains the staging blocker; adding application logs cannot diagnose a failure before application startup. Full deployed browser/mobile QA remains unverified.

Server archive restore, password recovery and verified email changes remain separate work. Paid-provider and Stripe test credentials and approved quota rules are still needed for live verification. The archive is deliberately bounded; larger accounts need a streamed/background export workflow before it can cover unrestricted history.

## Dependency security continuation

The fresh full-tree audit initially found 22 dependency findings (14 high, seven moderate, one low). Compatible security updates to Babel, browserslist, humanfs, brace-expansion, js-yaml and Undici 6/7 reduce this to ten (one high, nine moderate), all in the development-only Vercel CLI dependency tree. Production dependency audit reports zero findings at every severity. Undici 5 remains upstream in Vercel CLI and its Node builder; forcing it across a major version without deployment compatibility evidence is not treated as a safe fix. No critical findings remain.

Patch selection used the [brace-expansion advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [js-yaml advisory](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) and [Undici releases](https://github.com/nodejs/undici/releases). Existing major versions of application frameworks and Vercel CLI are preserved.

The final source-marker sweep still finds the legacy error-system reporting placeholder, unavailable provider metadata and normal form placeholders. It did not establish that account recovery, advanced model capabilities or staging deployment are complete.
