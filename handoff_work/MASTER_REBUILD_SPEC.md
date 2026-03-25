# Master Rebuild Spec

This is the single-file rebuild document for the current repository state.

Use this file if you need to reconstruct the project to the same stage as the current baseline without relying on the older tracker files.

## 1. Exact Baseline Identity
- Repository: `MultiLLM-Chat-Assistant`
- Canonical branch: `main`
- Current baseline commit: `b1afac3f979956aa99a238d7bf5a73932f0dd366`
- Latest promoted PR: `#60`
- Release tag: `handoff-baseline-2026-03-09`
- Production URL: `https://multi-llm-chat-assistant.vercel.app`
- Fresh immutable production deployment URL verified on `2026-03-14`:
  - `https://multi-llm-chat-assistant-76hek2to4-itsokialready8.vercel.app`
- Runtime-fix baseline kept for historical reference:
  - `8e9e49794a72b534dfd54138e4bdf73581c7fb1c`

## 2. What The System Is
This is a Next.js multi-provider LLM application with:
- authenticated chat and streaming
- provider configuration and encrypted API key storage
- goals, personas, analytics, comparison, pipeline, billing, and admin/status surfaces
- optional Python sidecar orchestration
- production verification, smoke testing, rollback proof, and billing proof already completed

## 3. Current Product Contract
### Core supported scope
- home
- auth
- chat / stream / conversations
- provider settings / config
- goals
- personas
- analytics
- health

### Optional scope
- billing + Stripe webhook flow
- Python orchestration bridge
- API test page

### Experimental scope
- comparison
- pipeline
- AI roundtable
- admin pages/routes

### Removed from supported production scope
- `/api/teams`

## 4. Runtime Topology
### Production requirements
- Postgres required
- strict auth required
- auth secret required
- provider key encryption seed required

### Optional production systems
- Stripe
- Python sidecar
- Redis
- OAuth providers

### Production fallback policy
- in-memory persistence is not an accepted production persistence mode
- guest/demo access is not accepted for protected production access
- optional subsystems may degrade cleanly without redefining core availability

## 5. Exact Stack
### Application/runtime
- Next.js `^16.1.1`
- React `^18`
- React DOM `^18`
- TypeScript `^5`
- NextAuth `^4.24.7`
- Prisma client `7.3.0`
- Prisma adapter `7.3.0`
- PostgreSQL driver `^8.20.0`
- Redis `^5.11.0`
- Stripe `^20.4.1`
- Zod `^4.3.6`
- Framer Motion `^12.35.2`

### Key dev/runtime support
- Prisma CLI `7.3.0`
- Vitest `^3.2.4`
- Playwright `^1.55.0`
- ESLint `^9`

### Locked dependency decision
- Prisma family is intentionally held at `7.3.0`
- reason: latest Prisma line still preserves the same advisory chain and does not justify a coordinated migration in the current state

## 6. Repository Layout
- `app/`: pages, layouts, API handlers
- `components/`: reusable UI
- `lib/`: auth, crypto, cache, rate-limit, release metadata, sidecar health, shared helpers
- `services/`: domain logic for conversations, goals, personas, analytics, streaming, export/import
- `prisma/`: schema + migrations
- `src/core/`: optional Python sidecar
- `test/`: Vitest unit/integration tests
- `tests/`: Python tests
- `scripts/`: deploy, smoke, verify, preview-parity, branch protection, upgrade helpers

## 7. Page Surface
### Product pages
- `/`
- `/multi-chat`
- `/settings`
- `/goal-hub`
- `/personas`
- `/analytics`
- `/comparison`
- `/pipeline`
- `/ai-roundtable`
- `/billing`
- `/api-test`

### Auth pages
- `/auth/signin`
- `/auth/signout`
- `/auth/error`

### Admin pages
- `/admin/status`
- `/admin/errors`

## 8. API Surface
### Auth
- `/api/auth/[...nextauth]`
- `/api/auth/upgrade-guest`

### Configuration
- `/api/config`
- `/api/provider-configs`
- `/api/test-api-key`

### Core product
- `/api/conversations`
- `/api/conversations/[id]`
- `/api/goals`
- `/api/goals/[id]`
- `/api/personas`
- `/api/personas/[id]`
- `/api/analytics`
- `/api/llm/chat`
- `/api/llm/stream`
- `/api/llm/orchestrate`
- `/api/health`

### Billing
- `/api/subscriptions`
- `/api/subscriptions/manage`
- `/api/webhooks/stripe`

### Admin / experimental
- `/api/admin/status`
- `/api/admin/errors/stats`

### Removed from supported production scope
- `/api/teams`

## 9. Authentication Model
- production strict auth is mandatory
- `NEXTAUTH_SECRET` or `AUTH_SECRET` is required
- `NEXTAUTH_URL` is required
- guest/demo flows are allowed only outside production
- auth/session handling was repaired and proven live after the production cookie/session defect fix

Primary auth files:
- `lib/auth.ts`
- `lib/api-auth.ts`
- `lib/demo-account.ts`
- `proxy.ts`
- `lib/session-cookie.ts`

## 10. Data and Persistence Model
- database runtime is Prisma + Postgres
- production fails closed when `DATABASE_URL` is missing
- service layer is DB-first
- fallback behavior exists for development/degraded scenarios, but not as a supported production persistence substitute

Key persistence files:
- `lib/prisma.ts`
- `lib/db-fallback.ts`
- `services/conversation-service.db.ts`
- `services/goal-service.db.ts`
- `services/persona-service.db.ts`
- `services/analytics-service.ts`

## 11. LLM and Provider Model
Supported provider families in code:
- OpenAI
- Anthropic
- Google AI
- OpenRouter
- Grok

Key files:
- `lib/providers/registry.ts`
- `lib/providers/openai.ts`
- `lib/providers/anthropic.ts`
- `lib/providers/googleai.ts`
- `lib/providers/openrouter.ts`
- `lib/providers/grok.ts`
- `app/api/llm/chat/route.ts`
- `app/api/llm/stream/route.ts`
- `app/api/llm/orchestrate/route.ts`

## 12. Observability and Diagnostics State
This baseline already includes:
- release metadata surfaced in `/api/health`
- release metadata surfaced in `/api/admin/status`
- release metadata attached to structured logs
- separate cache diagnostics and rate-limit diagnostics
- optional sidecar diagnostics surfaced in admin status
- normalized health timing fields with `responseTimeMs`

Key files:
- `lib/release-metadata.ts`
- `lib/logger.ts`
- `lib/api-logger.ts`
- `lib/cache.ts`
- `lib/rate-limit.ts`
- `lib/sidecar-health.ts`
- `app/api/health/route.ts`
- `app/api/admin/status/route.ts`
- `app/admin/status/page.tsx`

## 13. Environment Contract
### Required for core production availability
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`

### Optional families
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRO_PRICE_ID`
  - `STRIPE_WEBHOOK_SECRET`
- Sidecar:
  - `PYTHON_CORE_URL`
- OAuth:
  - provider-specific OAuth envs
- Redis:
  - `REDIS_URL`

### Env policy
- missing required core envs must fail closed in production
- optional env families may degrade cleanly
- no secrets should appear in docs, logs, or examples

## 13A. Security Posture Authority
- posture summary:
  - `docs/SECURITY_POSTURE.md`
- threat model:
  - `docs/THREAT_MODEL.md`
- secrets rotation:
  - `docs/SECRET_ROTATION.md`
- backup/restore proof status:
  - `docs/BACKUP_RESTORE_PROOF.md`
- operator incident flow:
  - `docs/OPERATOR_RUNBOOK.md`

## 14. CI and Quality Gates
### Required GitHub gates
- `Quality Checks`
- `Smoke Tests`

### Non-blocking signal
- `Security Audit`
- external Vercel / Netlify / Cloudflare statuses are informational unless branch protection changes

### Local quality gate
- `npm run lint`
- `npm run type-check`
- `npm run test:run`
- `npm run build`

## 15. Deployment and Recovery Procedure
### Preview path
- pull preview env
- build with preview parity
- deploy prebuilt preview
- run verify + smoke against preview

### Production path
- pull production env
- build with production env parity
- `npx vercel deploy --prebuilt --prod --force --yes --logs`
- run verify + smoke against canonical production URL

### Recovery path
- rollback by promoting a known healthy deployment
- rerun verify + smoke
- restore desired deployment and rerun verify + smoke

### Proven deployment evidence already exists
- preview proof: complete
- production proof: complete
- rollback proof: complete
- restore proof: complete
- fresh production deployment from current `main`: complete on `2026-03-14`

## 16. Verification State Already Proven
- technical handoff-ready: complete
- billing-ready: complete
- live checkout proof: complete
- live portal proof: complete
- signed webhook proof: complete
- clean install/build/test proof: complete
- production verify: complete
- production smoke: complete
- rollback and restore: complete

## 17. Current Residual Risks
- transitive dependency advisories remain open and require a separate coordinated decision, mainly around the Prisma toolchain
- external preview/deploy integrations still create noisy PR statuses
- Python sidecar exists but is not part of the locked core production contract
- database backup/restore proof procedure is now documented, but local execution evidence is still pending because PostgreSQL client tooling is absent in this workspace

## 18. Exact Rebuild Procedure
If rebuilding this project to the same stage from scratch, do this in order:
1. recreate repository structure matching Section 6
2. recreate page surface matching Section 7
3. recreate API surface matching Section 8
4. enforce runtime topology from Sections 4 and 13
5. implement auth model from Section 9
6. implement persistence model from Section 10
7. implement provider model from Section 11
8. implement observability model from Section 12
9. install exact stack families from Section 5
10. wire CI gates from Section 14
11. wire deployment and recovery procedure from Section 15
12. verify all proof states in Section 16 before calling the rebuild equivalent

## 19. Single Current Forward Plan
This is the exact ordered plan from the current stage forward. Do not deviate.
1. freeze baseline
2. define one exact ICP and one exact use case
3. define the primary value metric
4. cut product scope to the core workflow
5. redesign onboarding and activation
6. harden core UX
7. build real analytics and decision telemetry
8. prove reliability under realistic load and degraded dependencies
9. finish security posture to buyer-grade
10. validate monetization behavior
11. acquire first real users in one niche channel
12. prove retention
13. build one real moat deeply
14. package buyer diligence materials
15. prove financial performance
16. add enterprise-specific features only if demanded by the target buyer

## 20. Non-Negotiable Rules Going Forward
- no deviation from the ordered plan in Section 19
- no reopening release-closeout work
- no random feature sprawl
- no broad dependency churn without direct justification
- no direct casual edits on `main`
- no claims of `9/10` maturity without user proof, retention proof, and commercial proof
