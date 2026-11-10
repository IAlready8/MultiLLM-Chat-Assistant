# Launch Checklist

The ordered operator steps to open this deployment to the public with paid
plans. Everything here is configuration or a decision; none of it is code.
After each step, `/admin/status` shows what is still missing under
Launch Readiness.

Never paste a secret into a file, a commit, a chat or a log. Set values in the
hosting provider's environment settings for the Production environment, then
redeploy so they take effect.

## 1. Operator identity (required before public traffic)

| Variable | Purpose |
|---|---|
| `LEGAL_ENTITY_NAME` | Named as the operator on `/terms` and `/privacy` |
| `SUPPORT_EMAIL` | Contact on `/terms`, `/privacy`, `/support`, `/pricing`; enables `/.well-known/security.txt` |
| `LEGAL_GOVERNING_LAW` | Optional. Adds the governing-law clause to `/terms` |

Check: open `/terms`, `/privacy` and `/support` signed out. The operator name
and contact address appear. `/.well-known/security.txt` returns 200.

## 2. Legal review (required before taking payment)

Read `/terms` and `/privacy` as published and confirm each of these, or change
the page:

- payments are not refundable except where the law requires;
- the minimum age is 18;
- the list of data collected and the third parties it is shared with.

When the wording changes, bump `LEGAL_LAST_UPDATED` in `lib/legal.ts`.

## 3. Sign-up (required for new users)

Set one complete pair: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, or
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. In that provider's console the
authorized redirect URI is `<NEXTAUTH_URL>/api/auth/callback/google` or
`<NEXTAUTH_URL>/api/auth/callback/github`.

Check: `/auth/register` shows the provider button and a new account can be
created end to end.

## 4. Plan allowances (required before selling Pro)

Set `LLM_MONTHLY_REQUEST_LIMITS` to the approved numbers, for example
`{"FREE":50,"PRO":2000,"ENTERPRISE":null}`. `null` means unlimited. Pro must
allow more than Free or the paid plan sells nothing extra.

Check: `/pricing` and `/billing` show both allowances.

## 5. Stripe (required to take payment)

In this order:

1. In Stripe live mode, confirm the Pro product has one active, fixed,
   recurring price.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PRO_PRICE_ID`.
3. Create a webhook endpoint at `<NEXTAUTH_URL>/api/webhooks/stripe` for
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid` and `invoice.payment_failed`, and set
   `STRIPE_WEBHOOK_SECRET` to its signing secret. All three Stripe variables must be set together or the
   app refuses to start in production.
4. Enable the Customer Portal in Stripe (cancel subscription and update
   payment method).
5. Redeploy.

Check: `/pricing` shows the live price. With a real card on a test account:
subscribe, confirm the tier becomes Pro on `/billing`, open the portal, cancel,
and confirm the cancellation shows on `/billing`.

## 6. Final verification

1. `/admin/status`: Launch Readiness reads `ok`, and every health check is ok.
2. `/api/health` reports the release commit that was just deployed.
3. Signed out: `/pricing`, `/terms`, `/privacy`, `/support` load; `/settings`
   redirects to sign-in.
4. On a throwaway account: download account data, export the conversation
   archive, then delete the account from Settings, Advanced.

## 7. After opening

- Watch `/admin/errors` and the Stripe webhook delivery log for the first day.
- Decide whether Comparison, Pipeline and AI Roundtable should carry an
  "experimental" label in the product. The Terms allow for one; the product
  does not currently show it.
