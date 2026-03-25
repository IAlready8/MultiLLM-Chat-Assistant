# Secret Rotation Procedure

This procedure defines how to rotate security-sensitive environment values
without guessing and without silently invalidating production state.

## Secret Families

Core production secrets:
- `NEXTAUTH_SECRET` or `AUTH_SECRET`
- `API_KEY_ENCRYPTION_SEED`

Optional but security-sensitive secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- OAuth provider client secrets
- provider API keys stored in app configuration

## Rotation Rules

- rotate one family at a time
- record the old and new value ownership outside the repo
- never commit rotated values to version control
- re-run verification immediately after rotation
- if rotation affects user sessions, announce that impact first

## NEXTAUTH_SECRET / AUTH_SECRET

Impact:
- existing session cookies may become undecryptable
- users may need to sign in again

Procedure:
1. set the new secret in the target deployment environment
2. redeploy the application
3. verify:
   - protected page redirects still work
   - protected API routes still authenticate valid sessions
   - `/api/auth/session` returns expected session state after re-auth
4. expect legacy cookies to be treated as unauthenticated

Evidence already present in code/tests:
- JWT decryption failures downgrade to unauthenticated behavior
- `test/api-auth.test.ts`
- `test/auth-session-reader.test.ts`
- `test/middleware-auth-routing.test.ts`

## API_KEY_ENCRYPTION_SEED

Impact:
- provider API keys encrypted with the old seed may no longer be decryptable

Procedure:
1. treat this as a coordinated maintenance event
2. export or otherwise preserve operator-controlled provider credentials before
   rotation
3. set the new seed in the target deployment environment
4. redeploy
5. re-enter and validate provider keys through the supported settings flow
6. verify provider connectivity using existing app/provider checks

Important rule:
- do not rotate the encryption seed casually in production
- this is not a zero-impact secret

## Stripe Secrets

Procedure:
1. rotate `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the deployment
   platform
2. confirm the webhook endpoint is updated with the new signing secret
3. redeploy if required by platform behavior
4. verify:
   - checkout session creation
   - portal session creation
   - signed webhook acceptance

## OAuth Provider Secrets

Procedure:
1. rotate provider secret in the provider console
2. update matching deployment env
3. verify sign-in for that provider only

## Post-Rotation Verification Minimum

After any rotation, run:
1. `npm run verify:prod -- --base-url https://<target-domain>`
2. `bash scripts/smoke-test.sh --base-url https://<target-domain>`

If billing secrets changed, also run:
1. `npm run verify:prod -- --base-url https://<target-domain> --require-stripe --check-webhook`
