# Billing Evidence

## Status
- Billing-ready: complete
- Technical handoff-ready blocker: no
- Separate commercial/billing gate: yes

## Current Billing Truth
- billing routes and webhook contracts are implemented and covered by automated route tests
- billing surfaces are optional, not part of core availability
- Stripe-unconfigured degradation behavior is explicitly tested
- signed webhook validation path exists in `scripts/verify-production.sh`
- production Stripe env is present in Vercel
- billing-enabled production verification with `--require-stripe --check-webhook` passed on the promoted production deployment
- live browser billing proof passed on deployed production:
  - `/billing` remained on the billing page for an authenticated user
  - `POST /api/subscriptions` returned `200` with a Stripe Checkout URL
  - `POST /api/subscriptions/manage` returned `200` with a Stripe Billing Portal URL

## Verified Billing Evidence
- production deployment promoted: `dpl_8PpkUKh3obH4r4oMur8knNyRQ5wu`
- canonical production URL: `https://multi-llm-chat-assistant.vercel.app`
- billing-enabled production verification passed after promotion
- production smoke passed after promotion
- browser-backed billing proof completed with a real authenticated production session using Stripe test mode

## Outcome
- billing-ready is now proven and no longer pending
- billing remains an optional subsystem for technical handoff purposes, but it is now also commercially validated on deployed production

## Automated Coverage Already Present
- `test/api-subscriptions-routes.test.ts`
- `test/api-stripe-webhook-route.test.ts`
- `scripts/verify-production.sh --require-stripe --check-webhook`
