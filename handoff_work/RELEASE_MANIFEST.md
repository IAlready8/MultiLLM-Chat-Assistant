# Release Manifest

## Baseline Identity
- Baseline branch: `main`
- Closeout branch: `codex/final-handoff-closeout-20260308`
- Pre-closeout `main` commit SHA: `4ba06123781766e2dff123e491291cf0785d6e25`
- Final PR number: pending creation on this branch
- Release tag name: pending final merge date

## Proven Deployment References
- Preview deployment ID: `dpl_7rCmEBpM3mwNNMcvTkoHCoJQ2vhA`
- Preview URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- Production deployment ID: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- Rollback deployment ID: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Production canonical URL: `https://multi-llm-chat-assistant.vercel.app`

## Latest Proven Verification
- Last verified status source timestamp: `2026-03-08T07:27:49Z`
- Last smoke summary: `19` passed, `0` failed, `13` skipped
- Core deployment gates proven:
  - preview verify + smoke
  - production verify + smoke
  - rollback verify + smoke
  - restore verify + smoke

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
