# V1 operating policy draft

Prepared November 4, 2026 (America/Toronto). Owner delegated policy drafting in this chat. This document is preparation, not published legal text or a claim that deletion/support operations have been implemented.

## Approved commercial offer

- BYOK workspace access; provider API fees are separate. Consumer chat subscriptions are not API keys.
- Free: 50 attempted provider generations per UTC calendar month.
- Pro: CAD 19 monthly, 2,000 attempted provider generations per UTC calendar month, at most four models per comparison.
- Each dispatched model attempt consumes one unit, including provider failures and cancellations. Three models consume three units. Replay consumes zero; deletion does not refund units. No automatic paid retries.
- Reset: 00:00 UTC on the first of each calendar month, independently of the billing anniversary. No rollover.
- Cancel renewal through the billing portal; retain access through the already-paid period. Account deletion immediately ends access and must stop renewal before removing local billing mappings.
- No Enterprise sales. The example configuration sets the retained internal tier's cap to zero; no unlimited production tier.

## Selected policy defaults for legal/operational review

- Refunds: allow a request for the first workspace subscription payment within 14 calendar days of purchase. Refund only workspace fees, not provider charges. Later renewals are non-refundable except where required or a documented billing error occurred. Requests require operator review; refunds and subscription cancellation are separate actions. Do not claim this process is operational before a private support recipient is verified.
- Active retention: keep account information, saved prompts/results, personas and encrypted provider keys while the account remains active. Individual deletion removes active application records; data exports omit raw provider keys and payment credentials.
- Account deletion: fresh identity proof, explicit confirmation and a durable retryable workflow. Stop new work immediately after intent is recorded. Stop Stripe renewal and expire pending checkouts before completing application-data removal. Do not promise deletion while an external step failed. Retain only minimal deletion/billing reconciliation records needed to prevent stale events from restoring access; document an actual schedule before launch.
- Backups: disclose the actual provider retention and any separate backups. The read-only Neon project response reports 21,600 seconds (six hours) of history retention on November 4. This is configuration evidence, not a successful restoration or proof that no other copies exist. Do not publish an invented 30/35-day erasure claim.
- Provider processing: selected vendors receive the submitted prompt/context. Vendor terms, retention and charges apply separately. Never claim zero retention or no model training across all vendors without vendor-specific evidence.
- Usage/support: existing essential account/usage/error telemetry may remain. Do not send prompts, raw provider responses or credentials to monitoring. No new advertising trackers or testimonial/savings claims.
- Support: a working private email recipient and an accountable operator must be verified before launch. Public GitHub issues can accept non-sensitive bug reports; they are unsuitable for private deletion, billing and privacy requests. No promised response SLA until staffing is confirmed.

## Publication blockers

The connected Stripe business profile has no business name, legal company name, support email or support URL. Its website is the existing Vercel app. A legal entity/name and functioning private support channel cannot be invented. Public terms/privacy must identify the actual operator and accurately describe implemented deletion, backup and billing behavior. These facts and an appropriate final notice remain mandatory release gates.
