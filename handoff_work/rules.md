# .rules

1. Evidence-only.
   - Every project claim must be tied to a repository file path or a command output captured in the current session.
   - If no proof exists, write `UNVERIFIED`.

2. Topological execution only.
   - Follow `CLOSURE_MASTER_CHECKLIST.md` in order.
   - Do not work on later-phase polishing before earlier-phase scope/runtime truth is locked.

3. Scope discipline.
   - A page, route, or service is not automatically in production scope just because it exists.
   - Each visible surface must be classified as one of:
     - supported
     - optional
     - experimental
     - remove from scope

4. Runtime discipline.
   - Do not leave production topology ambiguous.
   - Document exactly whether production requires:
     - Postgres
     - strict auth
     - Stripe
     - Python sidecar
     - Redis
   - If a dependency is optional, state the exact disabled behavior.
   - Current locked production shape (2026-03-02):
     - Postgres: required
     - strict auth: required
     - Stripe: optional
     - Python sidecar: optional
     - Redis: optional/out of core contract

5. Fallback discipline.
   - In-memory fallback is not acceptable as production persistence unless explicitly approved.
   - Guest/demo bypass is not acceptable as protected production access unless explicitly approved.

6. Documentation discipline.
   - Assume top-level docs may be stale until proven otherwise.
   - Update or archive stale docs before writing final status claims.

7. Test discipline.
   - "Has tests" is not the same as "passed tests".
   - Record:
     - what test files exist
     - what commands were executed
     - what passed
     - what failed
     - what was not run

8. Security discipline.
   - Never expose plaintext secrets in logs, docs, status files, or examples.
   - Any auth, billing, webhook, provider-key, or admin change requires explicit verification.

9. Handoff discipline.
   - Final handoff requires:
     - verified deploy path
     - verified rollback path
     - docs matching code
     - known limitations documented
     - residual risks named
