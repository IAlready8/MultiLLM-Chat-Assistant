# Environment Inventory

This inventory lists env families only. No secret values are recorded here.

## Auth / Session
- Variables:
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET` or `AUTH_SECRET`
  - `AUTH_OWNER_EMAILS`
  - optional `AUTH_ADMIN_EMAILS`
- Required for core availability: yes
- Where it matters: auth routing, session handling, protected pages/routes
- Effect if absent: production auth fails closed or misroutes

## OAuth Account Creation
- Variables:
  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  - `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
- Required for core availability: at least one complete pair is required for self-service account creation
- Where it matters: NextAuth provider discovery, OAuth callbacks, durable user/account creation
- Effect if absent: existing password users can sign in, but new users cannot create accounts

## Database
- Variables:
  - `DATABASE_URL`
- Required for core availability: yes
- Where it matters: Prisma runtime client, persistence-backed routes/services, startup validation
- Effect if absent: production runtime fails closed

## Encryption / Secret Management
- Variables:
  - `API_KEY_ENCRYPTION_SEED`
  - optional `NEXT_PUBLIC_SECURE_STORAGE_KEY`
- Required for core availability: seed yes, public override no
- Where it matters: provider key storage, config management, runtime validation
- Effect if absent: provider key lifecycle is unsafe or blocked

## Provider API Keys
- Variables:
  - provider-specific keys as enabled by the operator
- Required for core availability: conditionally required per provider in use
- Where it matters: chat/stream/provider test flows
- Effect if absent: that provider is unavailable, but app can still run with other configured providers

## Cache / Redis
- Variables:
  - Redis/rate-limit related envs when configured
- Required for core availability: no
- Where it matters: optional caching and rate-limit diagnostics
- Effect if absent: app stays operable with non-Redis fallback behavior where supported

## Sidecar
- Variables:
  - `PYTHON_CORE_URL`
- Required for core availability: no
- Where it matters: optional orchestration bridge and sidecar health checks
- Effect if absent: orchestration sidecar path is unavailable; core app still operates

## Stripe Billing
- Variables:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRO_PRICE_ID`
  - `STRIPE_WEBHOOK_SECRET`
- Required for core availability: no
- Where it matters: billing page, checkout route, manage portal route, Stripe webhook validation
- Effect if absent: billing routes degrade explicitly and billing-ready cannot be declared

## Deployment Platform
- Variables:
  - platform-managed deployment metadata and local helper envs used by Vercel tooling
- Required for core availability: no at app runtime; yes for operator workflows that pull scoped envs
- Where it matters: local preview-parity scripts, Vercel env pull flows, protected preview verification
- Effect if absent: operator cannot reproduce preview/prod parity workflows from CLI
