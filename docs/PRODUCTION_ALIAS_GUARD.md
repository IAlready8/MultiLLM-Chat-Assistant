# Production Alias Guard

The canonical production URL can remain healthy while serving an older deployment.
Treat `/api/health` release metadata as the source of truth and compare its full
`release.commitSha` and exact `release.version` with the intended artifact before
declaring a release complete.

## Local verification

Run the guard with the canonical URL and the exact 40-character commit SHA:

```bash
npm run ops:alias:check -- \
  --base-url https://multi-llm-chat-assistant.vercel.app \
  --expected-commit-sha <full-release-commit-sha> \
  --expected-version <exact-release-version>
```

The guard fails closed when:

- the request times out or redirects
- the endpoint returns a non-success HTTP status or invalid JSON
- the deployment reports anything other than `status=healthy`
- `release.commitSha` is missing or is not a full SHA
- the observed SHA does not exactly match the expected SHA
- `release.version` is missing, malformed, or does not exactly match the expected
  version

It does not promote a deployment or modify Vercel. Promotion remains an explicit
operator action described in `VERCEL_DEPLOYMENT.md` and `docs/OPERATOR_RUNBOOK.md`.

## GitHub workflow

Run **Ops - Production Alias Guard** manually and provide:

- the exact 40-character commit SHA that was deployed and promoted
- the exact release version that was deployed and promoted

The workflow is bound to `https://multi-llm-chat-assistant.vercel.app`; operators
cannot substitute a preview or unrelated domain. It uses no Vercel credentials and
only reads the public health endpoint.

## Release order

1. Complete the production build and deployment.
2. Promote the intended deployment to the canonical alias.
3. Run `verify:prod` and the smoke suite against the canonical URL.
4. Run the alias guard with the exact promoted commit SHA and release version.
5. Record the deployment ID, full SHA, release version, canonical URL, and passing
   verification.

Do not substitute repository `HEAD` automatically. Production may intentionally lag
`main`; the expected SHA must identify the deployment being released.
