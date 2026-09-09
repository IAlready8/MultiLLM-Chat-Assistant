# Staging and security continuation — September 9, 2026

This supersedes the provisioning blocker and dependency counts in the September 8 handoff. PR 161 remains open; neither merge nor production promotion is authorized by this change.

## Staging proven

The approved archived Neon preview branch was removed after checking its identity and non-primary status. Vercel then provisioned `preview/codex/production-completion-20260907` (`br-small-scene-ai3gt2nd`). Main was preserved. Capacity is again 10/10; future unrelated preview branches still require capacity management.

Deployment `dpl_AxJTPWwo8XHmRZ9VgvHwFDR1NZDT`, commit `1c1d64f1a2850780e5ca3cb96b3b79812b88ba6e`, reached READY. Its build logs prove Prisma found six migrations and applied the five outstanding migrations successfully. Migration execution is restricted by exact preview environment, Git branch and database hostname guards; production builds do not automatically migrate.

The deployed health endpoint returned healthy, PostgreSQL connected and distributed PostgreSQL rate limiting connected. Cache remains in-memory. PostgreSQL rate limits remove the mandatory Redis dependency for admission control; they do not provide a distributed cache.

GitHub CI run 34414424909 passed quality, coverage, and both native smoke matrices (Redis and PostgreSQL rate limiting), including PostgreSQL 16 migrations, concurrent admission checks, generation integration and authenticated Chromium QA. The security job correctly failed on newly published dependency advisories and is addressed by the next security commit.

Cloud browser inspection confirmed the deployed sign-in page renders Google/password options. Captured console errors came from the browser extension, not the application. Authenticated deployed chat and outage drills remain unverified. Vercel protection intercepted direct protected-route probes; these are not evidence of application authorization behavior. CI authorization tests remain the verified evidence.

## Security remediation

- Next.js resolves to 16.3.4 with matching ESLint configuration; Sharp to 0.35.4. Addresses [Next.js image optimization](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) and [Sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) findings.
- js-yaml 4 resolves to 4.3.2 and smol-toml to 1.7.1 for their published denial-of-service fixes.
- Undici defaults to 6.28.0, with an explicit @vercel/sandbox exception retaining 7.29.0. This avoids an npm 10 range-override resolution bug found by the first clean CI install. `npm ls undici --all` reports a valid dependency graph.
- `scripts/test-vercel-tooling.mjs` exercises Vercel's actual proxy dispatcher and native Node function dev server: NO_PROXY, CONNECT forwarding, POST bodies, multiple cookies and streamed responses. This is now a CI gate, not just a CLI version check.
- Removed the error boundary's fake “report sent” control, which only logged locally. Home navigation uses Next Link and clears boundary state.

Fresh audit after these changes reports zero high/critical findings and three moderate development-only findings in Vitest/@vitest/mocker/coverage. Production dependencies have no reported findings. This is a dependency audit, not proof of absence of application vulnerabilities. The Vitest advisory requires a coordinated test-runner upgrade; never suppress the audit or silently weaken coverage to resolve it.

## Remaining release gates

1. Confirm whether the connected Stripe test account named **Manus-prompt-base** is intended for MultiLLM, then supply approved price/allowance rules. No account or pricing was guessed; no live Stripe configuration was changed.
2. Establish staging sign-in and provider test credentials, then exercise deployed multi-model success/partial failure, cancellation, reload and billing accounting.
3. Exercise secured cron reconciliation and process/database outages in staging. A branch-specific cron secret is configured, but configuration alone is not operational proof.
4. Implement password recovery and verified email changes with the selected email service and policy.
5. Implement message pagination without dropping older model context or splitting turn attribution. Existing conversation-list pagination is not message pagination.
6. Upgrade Vitest and preserve all behavioral tests and coverage gates; rerun the entire suite and native browser matrices.

Keep PR 161 open until current CI passes and remaining deployment, billing and credential-dependent release gates are resolved. Do not merge just because the preview builds.

## Vitest 4 compatibility experiment

Vitest 4.1.11 and matching coverage provider passed all 619 tests in 82 files. Unexecuted source files were explicitly retained in coverage, matching the previous all-source intent. Its AST remapping reported 46.39% statements, 42.70% branches, 42.57% functions and 47.03% lines, below the existing 60% branch / 55% function gates. The experiment was not published: Vitest 3.2.7 and the original coverage configuration were retained. Closing the three moderate tool findings requires improving real branch/function coverage before migrating, not lowering thresholds or excluding unexecuted files.

## Final correction validation

Clean installs succeeded with npm 10.9.4 (CI) and npm 11.11.1 (packageManager), with a valid Undici graph. On Node 22, strict typecheck, zero-warning lint, 619 tests / 82 files, coverage gates (44.41% lines, 75% branches, 70.77% functions), Vercel proxy/function compatibility, production build and repository hygiene all passed. Fresh audit reports zero high/critical and three moderate development-only Vitest findings. The final source sweep found mostly form/stream placeholders; the monitoring integration in lib/error-system.ts still only logs locally and must not be described as an external monitoring service.
