# Deployment Evidence

## Preview Proof
- Deployment ID: `dpl_7rCmEBpM3mwNNMcvTkoHCoJQ2vhA`
- URL: `https://multi-llm-chat-assistant-gwteq1v5v-itsokialready8.vercel.app`
- Verification flow:
  - branch-scoped preview env pulled from Vercel
  - `npx vercel build` executed with preview parity
  - `npx vercel deploy --prebuilt --target preview --force --yes --logs`
  - authenticated preview verification via `USE_VERCEL_CURL=true`
- Result:
  - `verify-production.sh` passed
  - smoke passed: `19` passed, `0` failed, `13` skipped
  - health status: `healthy`, database `connected`

## Production Proof
- Deployment ID: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- Canonical URL: `https://multi-llm-chat-assistant.vercel.app`
- Verification flow:
  - production env pulled from Vercel
  - `npx vercel build --prod` executed with production parity
  - `npx vercel deploy --prebuilt --prod --force --yes --logs`
  - explicit alias promotion via `npx vercel promote dpl_25CyyoAvGsJngacFVhx3TGtNrHhz --yes -S itsokialready8`
- Result:
  - `verify-production.sh` passed
  - smoke passed: `19` passed, `0` failed, `13` skipped
  - health status: `healthy`, database `connected`

## Rollback Proof
- Rollback target: `dpl_C8cHwKsZUsXo7PhZrw6kH7Y3gJ5c`
- Restore target: `dpl_25CyyoAvGsJngacFVhx3TGtNrHhz`
- Rollback flow:
  - promoted prior healthy deployment to canonical alias
  - re-ran verify and smoke successfully
  - restored latest intended deployment to canonical alias
  - re-ran verify and smoke successfully
- Result:
  - rollback proof: passed
  - forward recovery proof: passed

## Operational Lessons Locked In
- preview verification required authenticated `vercel curl`
- production alias movement required explicit `vercel promote ... -S itsokialready8`
- verify + smoke were sufficient to prove deploy, rollback, and restore integrity for core scope
