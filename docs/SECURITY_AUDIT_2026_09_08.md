# Security audit — September 8, 2026

Scope: repository source, API authorization/ownership, provider dispatch, billing/usage, migrations, dependency audits, CI execution and deployment diagnostics on [draft PR #161](https://github.com/IAlready8/MultiLLM-Chat-Assistant/pull/161). This is a code and test audit, not a penetration-test certification or proof that production is correctly configured.

## Material findings addressed

| Priority | Finding | Implemented control | Executed evidence |
| --- | --- | --- | --- |
| P1 | Deleted accounts and old admin claims could survive in JWTs | Current User lookup on protected APIs; admin role recomputed from current email and operator allowlists; store failure returns 503 | API tests and native deleted-user HTTP test |
| P1 | Provider request quotas could race or be bypassed by deleting conversations | Independent PostgreSQL admission ledger and per-user transaction lock; current paid entitlement checked on server | Native 9-request race: exactly 8 admitted; replay did not consume quota |
| P1 | Production rate limiting could degrade to per-process memory | Redis required in production; bounded connect/command waits; unavailable service denies admission | Redis failure tests and native Redis-connected integration |
| P1 | Process termination could strand running generations | Expiring leases, checkpoints, terminal compare-and-set and authenticated reconciliation | Lease race tests and native expired-generation recovery preserving content |
| P1 | Cross-origin protected mutations and redirect parsing edge cases | Origin/fetch-site checks; reject backslashes/control characters and external callback origins | Proxy and redirect regression tests; native cross-origin denial |
| P1 | Malformed/oversized request bodies and missing API-key values could damage configuration | Bounded object parsing; structured 400/413 responses; missing/nonstring key rejected rather than clearing stored keys | Input and configuration route tests |
| P1 | Legacy password exports padded/truncated passwords directly into AES keys | New exports use random 16-byte salt, PBKDF2-SHA-256 at 600,000 iterations and AES-256-GCM; legacy decryption retained | Real Node/WebCrypto round trips, Unicode, wrong password, tampering and legacy compatibility |
| P2 | Imported preferences could write arbitrary localStorage keys | Preference allowlist and bounded import size; API-key entries not restored | Export/import regression tests |
| P2 | Legacy export UI could be mistaken for server-history backup | Explicit local-only scope and accurate completion text | Source and interaction review; deployed browser check remains blocked |

The earlier completion phase also added durable ownership/idempotency checks, cross-account deletion denial, Stripe signature validation, atomic webhook event markers, customer serialization and current-subscription reconciliation. Those controls remained covered by the full regression suite.

## Coverage and negative findings

- Every API route file was enumerated. Protected routes use the shared authenticated user/admin guard. Public exceptions are NextAuth, health diagnostics, the Stripe-signed webhook and the separately Bearer-authenticated cron endpoint.
- Current provider credentials are encrypted on the server. Active LLM routes do not return credentials to the browser. Endpoint policy rejects unsafe destinations and redirects; local Ollama is development-only. Existing endpoint tests remain in the executed suite.
- No active application `dangerouslySetInnerHTML`, unsafe raw SQL interpolation API, dynamic code evaluation or client-controlled shell invocation was found in the targeted source search. Redis `eval` executes a fixed server-owned Lua admission script.
- Production npm audit returned zero findings across all severities. CI also passed the full-tree critical-vulnerability gate. Tracked environment-file and generated-artifact hygiene passed.
- A supplemental scan of tracked text for high-confidence provider tokens/private-key markers found only the documented synthetic Stripe logging fixture and its allowlist entry. It printed file/rule locations, not token values. Gitleaks was not installed; a full historical secret scan was not performed.
- Global TODO/FIXME/HACK/mock/placeholder searches were reviewed in context. Archived runbooks, controlled test providers and form placeholder attributes are not production functionality. Legacy client provider helpers and IndexedDB export code remain; the latter is explicitly local-only in the UI.

## Open release risks

| Priority | Remaining issue | Closure evidence required |
| --- | --- | --- |
| P0 release gate | Vercel fails resource provisioning before application build | A ready preview of the exact reviewed commit, staging migration and authenticated browser/mobile QA |
| P1 commercial gate | Commercial limits and Stripe test environment unavailable | Approved allowance policy, configured price, real signed lifecycle/redelivery tests and reconciliation of provider usage/cost |
| P1 operational gate | Live provider and deployment secrets unavailable | Credentialed provider matrix, configured Redis and cron, process-kill/outage exercise in staging |
| P2 product | Account recovery, verified email changes and server-history restore incomplete | Authorized end-to-end account lifecycle and cross-device recovery tests |
| P2 scale | Individual conversation reads still load full message history | Message pagination or a measured bound that preserves model context and ordering |
| P2 assurance | No deployed DAST, mobile browser run, historical secret scan or production restore rehearsal | Dedicated staging access, operator-run secret/history scan and backup/restore drill |

No existing user files, secrets, production records or unrelated branches were removed. Migrations are additive and were executed only against CI's disposable PostgreSQL database. Automatic generation retry remains deliberately absent: marking interrupted work and allowing explicit regeneration avoids hidden duplicate provider charges.

Password derivation parameters follow the PBKDF2-SHA-256 guidance in the [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); the encryption envelope uses authenticated AES-GCM, as covered by [OWASP cryptographic storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html). This does not claim FIPS certification.

## Account continuation update

See [account continuation](ACCOUNT_CONTINUATION_2026_09_08.md) for persisted profile ownership validation, consistent owned server-history export, local archive encryption/reading and the refreshed dependency scan. The export half of the earlier archive gap is now implemented; server restore remains open. Full-tree residual findings are explicitly documented there and are not covered by the zero-production-findings statement above.
