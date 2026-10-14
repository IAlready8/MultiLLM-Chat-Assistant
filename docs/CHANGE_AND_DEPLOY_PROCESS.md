# Change & Deploy Process

Standing rules for every change to this repo. No exceptions.

## 1. Every change goes through a PR

- Work happens on a feature branch, never directly on `main`.
- Open a pull request against `main` for every change, including docs and config.

## 2. CI must be fully green before merge

These gates must all pass — not "probably fine," actually green:

- **Quality Checks** (type-check, lint, unit tests, build)
- **Coverage** (required)
- **Security Audit**
- **Smoke Tests** (redis + postgres)

If any gate fails: fix it on the branch, re-run, and confirm green before proceeding.
Never merge with a red gate.

Note: the Vercel deployment check has been failing systemically across unrelated
PRs (not a code issue). GitHub CI is the authoritative gate until the Vercel
integration is fixed.

## 3. Human approval required

- No merge without explicit approval in the current conversation.
- "Verify and proceed" covers local, reversible work only. Push, PR, merge, and
  deploy always wait for the word.

## 4. Verify the deploy

After merge, Vercel auto-deploys `main`. Confirm before calling it done:

- `GET /api/health` returns `"status": "healthy"`.
- The reported commit SHA matches the merged commit.
- Rate limiting and database checks report connected (not degraded).

If the deploy is wrong, say so — don't assume.

## 5. Risky changes need manual verification

CI is not enough for these. Flag explicitly and verify by hand:

- **Auth** (login, sessions, JWT, password flows): real sign-in / sign-out round-trip.
- **Billing** (Stripe): checkout, webhook, portal, and subscription lifecycle.
- **Database migrations**: apply to production Neon (`multi-llm-prod`, `main` branch),
  record in `_prisma_migrations`, then re-check health.
- **Provider integrations**: real chat send, streaming, and cancellation.

## 6. Production database

- Lives on Neon, project `multi-llm-prod`, branch `main` — not Vercel Postgres.
- The Vercel build does **not** run `prisma migrate deploy`. Schema changes must be
  applied manually via the Neon SQL editor, then recorded in `_prisma_migrations`
  so future deploys don't re-apply them.
