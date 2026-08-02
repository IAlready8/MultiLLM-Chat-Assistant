# Authentication Setup

## Supported Account Model

The workspace requires a real authenticated session in every environment.

- Google and GitHub OAuth create durable users and linked provider accounts through the NextAuth Prisma adapter.
- Email/password signs in an existing user only when that user already has a bcrypt password hash.
- The credentials flow never creates users and returns the same public error for unknown emails and incorrect passwords.
- Public password registration is disabled until verified email ownership, password reset, and account recovery are implemented.
- Demo users, guest identities, bypass flags, and guest-to-user migration are not supported.

The primary implementation is in `lib/auth.ts`, `lib/credentials-auth.ts`,
`lib/api-auth.ts`, `proxy.ts`, and `components/oauth-provider-buttons.tsx`.

## Required Runtime Configuration

Configure these for the app runtime:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`
- `AUTH_OWNER_EMAILS` with at least one real operator email

Configure at least one complete OAuth provider pair for self-service account
creation:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

Never put provider secrets in source files, commits, issue comments, pull
requests, screenshots, or chat. Add them directly to the intended Vercel
environment scope.

`AUTH_OWNER_EMAILS` and optional `AUTH_ADMIN_EMAILS` are server-only,
comma-separated allowlists. Matching is case-insensitive. A signed-in user not
listed in either variable receives the `MEMBER` role; an owner entry takes
precedence over an admin entry. Changes take effect when the user's JWT session
is refreshed, so sign out and back in after changing an allowlist. Do not use a
shared mailbox or an email address that is not secured with MFA.

## Google OAuth

1. Open Google Cloud Console and select the production project.
2. Configure the OAuth consent screen with the real product name, support email,
   authorized domain, and privacy/terms links required by the selected audience.
3. Create an OAuth 2.0 Client ID with application type **Web application**.
4. Add this production JavaScript origin:

   `https://multi-llm-chat-assistant.vercel.app`

5. Add this production redirect URI exactly:

   `https://multi-llm-chat-assistant.vercel.app/api/auth/callback/google`

6. Add the generated ID and secret to Vercel as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` in the **Production** scope.

For local testing, add `http://localhost:3000` as an origin and
`http://localhost:3000/api/auth/callback/google` as a redirect URI. Do not reuse
a floating Vercel preview URL unless that exact callback is registered. A stable
preview domain and a separate OAuth client are safer for preview testing.

## GitHub OAuth

1. In GitHub, open **Settings → Developer settings → OAuth Apps**.
2. Create an OAuth App with this homepage URL:

   `https://multi-llm-chat-assistant.vercel.app`

3. Set this authorization callback URL exactly:

   `https://multi-llm-chat-assistant.vercel.app/api/auth/callback/github`

4. Add the client ID and generated client secret to Vercel as
   `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the **Production** scope.

Use a separate GitHub OAuth App for local or preview testing because a GitHub
OAuth App has a single callback URL.

## Vercel Configuration

Add credentials through Vercel Project Settings or an interactive CLI prompt.
Confirm the exact project and environment scope before saving anything.

Provider credentials are paired: setting only an ID or only a secret keeps that
provider disabled. After adding or changing environment variables, create a new
deployment; existing deployments do not receive new values automatically.

Preview and Production are separate scopes. Production credentials should not
be copied into Preview unless the preview callback URL is intentionally
registered with the provider.

## Callback Verification

Provider discovery is credential-free and is the safest way to prove that
NextAuth is constructing URLs for the intended deployment. For production
Google OAuth, run:

```bash
npm run ops:auth:check -- \
  --base-url https://multi-llm-chat-assistant.vercel.app \
  --provider google
```

The guard fails when the provider is absent, is not OAuth, the endpoint redirects
or times out, or the advertised sign-in/callback URL is derived from a different
domain. It never prints the OAuth client secret. The equivalent manual GitHub
workflow, **Ops - Production Auth Provider Guard**, is bound to the canonical
production domain so an operator cannot accidentally verify a preview URL.

This guard proves provider availability and callback construction. It does not
replace the provider-console allowlist: Google must still contain the same exact
callback URI under **Authorized redirect URIs**.

## Safe Rollout Order

1. Register the OAuth application with the exact canonical callback URL.
2. Add the provider ID and secret directly to Vercel Production.
3. Add the real operator email to `AUTH_OWNER_EMAILS` in Vercel Production.
4. Run `npm run ops:auth:check -- --base-url <deployment-url> --provider
   <provider-id>` to confirm the provider and exact callback URL. The discovery
   response must never expose a client secret.
5. Deploy the reviewed commit to a preview with its own registered OAuth client,
   or validate the credential-independent auth UI and route enforcement.
6. Run type-check, lint, unit tests, coverage, build, and unauthenticated smoke.
7. Test one real OAuth account: account creation, sign-out, repeat sign-in, and
   protected data isolation.
8. Confirm the allowlisted operator can access `/admin/status` and an ordinary
   member receives `403` from the same API.
9. Promote the exact verified deployment to the canonical alias.
10. Verify `/api/health`, protected-route redirects, provider discovery, and a
   complete sign-in/sign-out cycle on the canonical domain.

## Operational Checks

- `/api/health` remains public for platform probes.
- `/api/auth/*` and `/auth/*` remain public so sign-in and callbacks can run.
- Protected API requests without a session return `401`.
- Protected page requests without a session redirect to `/auth/signin` with a
  local callback path.
- Unknown and incorrect password attempts receive the same sign-in failure.
- `OAuthAccountNotLinked` must not be bypassed automatically; it protects an
  existing account from being linked solely by matching an email address.
- `npm run verify:prod -- --base-url <url> --require-oauth-provider google`
  verifies both the configured production env pair and the public canonical
  callback contract when Google account creation is release-blocking.

## Password Registration Follow-up

Do not enable public password registration by merely inserting a database row.
A production implementation also needs:

- single-use, expiring email-verification tokens;
- verified-email gating before account activation;
- single-use password-reset tokens;
- reset-token invalidation and rate limits;
- password policy and secure bcrypt work-factor handling;
- abuse controls and user-safe error messages;
- transactional email delivery and operational monitoring.

Until those controls exist, OAuth-first registration is the supported account
creation path.

## Legacy Identity Audit

The code no longer creates or accepts the former default demo/guest identities.
To check a database for those exact legacy rows without changing data, run:

`npm run auth:audit-legacy-users`

The command is read-only. It reports the candidate user IDs and dependent-record
counts so an operator can review the cascade impact before any deletion. Never
delete a candidate merely because its display name contains “demo”; require an
exact legacy ID or email match and a reviewed database backup.

After reviewing the audit, an operator can delete one exact approved legacy
identity and its dependent data with the guarded command below. Both identifiers
must resolve to the same row, the email must be an approved legacy email, and the
confirmation phrase must match exactly:

`npm run auth:delete-legacy-user -- --user-id <exact-id> --email <exact-email> --confirm DELETE_LEGACY_AUTH_USER_AND_DATA`

The deletion runs in one database transaction. Analytics rows are deleted
explicitly because the schema does not relate them to `User`; the remaining
dependent rows use database cascades. The command fails if post-delete
verification finds the user or any dependent records.
