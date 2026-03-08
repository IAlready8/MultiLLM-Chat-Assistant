# Billing Evidence

## Status
- Billing-ready: pending
- Technical handoff-ready blocker: no
- Separate commercial/billing gate: yes

## Current Billing Truth
- billing routes and webhook contracts are implemented and covered by automated route tests
- billing surfaces are optional, not part of core availability
- Stripe-unconfigured degradation behavior is explicitly tested
- signed webhook validation path exists in `scripts/verify-production.sh`
- production Stripe env is present in Vercel
- billing-enabled production verification with `--require-stripe --check-webhook` passed in this closeout branch
- live billing proof surfaced a server-side auth defect on protected billing pages/routes; the fix is now on this branch in `lib/auth.ts` and must be redeployed before checkout/portal can be re-proven

## What Is Still Pending
To declare billing-ready, the following must be evidenced on deployed infrastructure using Stripe test mode:
- checkout session creation
- customer portal session creation
- production smoke after billing validation

## Current Reason For Pending Status
- billing-ready is tracked separately to avoid blocking technical handoff on an optional subsystem
- production still needs the server-auth fix from this branch deployed before checkout and portal can be re-proven end-to-end

## Automated Coverage Already Present
- `test/api-subscriptions-routes.test.ts`
- `test/api-stripe-webhook-route.test.ts`
- `scripts/verify-production.sh --require-stripe --check-webhook`
