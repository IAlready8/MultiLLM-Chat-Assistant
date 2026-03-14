# Release Manifest

## Baseline Identity
- Baseline branch: `main`
- Final merged baseline SHA: `013d903f0d97b153a5df9e9125082da4167c421b`
- Runtime-fix baseline SHA: `8e9e49794a72b534dfd54138e4bdf73581c7fb1c`
- Runtime-fix branch: `codex/live-auth-cookie-fix-20260308`
- Pre-closeout `main` commit SHA: `923ecd49f3ab713e4f38c3430e6bf4a481edd92f`
- Runtime-fix PR number: `42`
- Runtime-fix PR merged at: `2026-03-09T02:15:42Z`
- Release tag name: `handoff-baseline-2026-03-09`
- Final baseline stamp PR: `43`
- Final baseline stamp merged at: `2026-03-09T06:31:18Z`
- Final baseline stamp merge commit: `c83a83736f0364df3f223399efda58b98c5f9e6e`
- Latest hardening promotion PR: `45`
- Latest hardening promotion merged at: `2026-03-13T10:36:56Z`
- Latest hardening promotion merge commit: `013d903f0d97b153a5df9e9125082da4167c421b`

## Proven Deployment References
- Preview deployment ID: `dpl_7rCmEBpM3mwNNMcvTkoHCoJQ2vhA`
- Preview URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- Production deployment ID: `dpl_8PpkUKh3obH4r4oMur8knNyRQ5wu`
- Rollback deployment ID: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Production canonical URL: `https://multi-llm-chat-assistant.vercel.app`

## Latest Proven Verification
- Last verified status source timestamp: `2026-03-14`
- Last smoke summary: `19` passed, `0` failed, `13` skipped
- Core deployment gates proven:
  - preview verify + smoke
  - production verify + smoke
  - rollback verify + smoke
  - restore verify + smoke
  - billing-enabled production verify + smoke
  - browser-backed checkout + portal proof on promoted production
  - fresh production deploy from current `main` followed by verify + smoke

## Current CI Release Gates
- `Quality Checks`
- `Smoke Tests`

## Residual Risk References
- `handoff_work/RESIDUAL_RISKS.md`
- `handoff_work/BILLING_EVIDENCE.md`

## Finalization Note
- release baseline is now merged to `main`
- actual merge-date tag has been created on the merged baseline
