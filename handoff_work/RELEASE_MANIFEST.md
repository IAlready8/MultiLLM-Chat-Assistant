# Release Manifest

## Baseline Identity
- Baseline branch: `main`
- Closeout branch: `codex/live-auth-cookie-fix-20260308`
- Pre-closeout `main` commit SHA: `923ecd49f3ab713e4f38c3430e6bf4a481edd92f`
- Final PR number: `42` (open while this hotfix branch is awaiting merge)
- Release tag name: pending final merge date

## Proven Deployment References
- Preview deployment ID: `dpl_7rCmEBpM3mwNNMcvTkoHCoJQ2vhA`
- Preview URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- Production deployment ID: `dpl_8PpkUKh3obH4r4oMur8knNyRQ5wu`
- Rollback deployment ID: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Production canonical URL: `https://multi-llm-chat-assistant.vercel.app`

## Latest Proven Verification
- Last verified status source timestamp: `2026-03-09T02:02:42Z`
- Last smoke summary: `19` passed, `0` failed, `13` skipped
- Core deployment gates proven:
  - preview verify + smoke
  - production verify + smoke
  - rollback verify + smoke
  - restore verify + smoke
  - billing-enabled production verify + smoke
  - browser-backed checkout + portal proof on promoted production

## Current CI Release Gates
- `Quality Checks`
- `Smoke Tests`

## Residual Risk References
- `handoff_work/RESIDUAL_RISKS.md`
- `handoff_work/BILLING_EVIDENCE.md`

## Finalization Note
After the final closeout PR merges:
- fill in the merged `main` baseline SHA
- stamp the final PR number
- create the release tag using the actual merge date: `handoff-baseline-YYYY-MM-DD`
- record that tag here
