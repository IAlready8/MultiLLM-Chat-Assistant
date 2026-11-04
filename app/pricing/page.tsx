import Link from 'next/link'
import { RELEASE_OFFER, BYOK_COPY, GENERATION_ALLOWANCE_COPY } from '@/lib/release-offer'
import { isPaidSignupEnabled } from '@/lib/legal-publication'

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-5 py-12">
      <h1 className="text-4xl font-semibold">A workspace subscription. Your own API keys.</h1>
      <p>{BYOK_COPY}</p>
      {!isPaidSignupEnabled() ? <p role="status" className="rounded-lg border border-border p-4">This is the approved offer for the planned release. Paid signup is not open yet.</p> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        {[{ name: 'Free', price: 'CAD 0', allowance: RELEASE_OFFER.limits.FREE }, { name: 'Pro', price: RELEASE_OFFER.priceLabel, allowance: RELEASE_OFFER.limits.PRO }].map(plan => (
          <section key={plan.name} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold">{plan.name}</h2>
            <p className="text-xl">{plan.price}</p>
            <p>{plan.allowance.toLocaleString('en-CA')} attempted provider generations per UTC calendar month.</p>
            <p>Single chat, comparisons with up to four selected models, saved conversations, and reusable personas.</p>
          </section>
        ))}
      </div>
      <p>{GENERATION_ALLOWANCE_COPY}</p>
      <p>Unused units do not roll over. Provider API charges are separate from the subscription. Any applicable subscription taxes must be shown at checkout.</p>
      <p>Cancel renewal through the billing portal and retain Pro access through the already-paid period. Account deletion ends access immediately and stops renewal; it does not automatically refund a payment.</p>
      <p>Review <Link className="underline" href="/terms">terms and refund policy</Link>, <Link className="underline" href="/privacy">privacy</Link>, and <Link className="underline" href="/support">support</Link> before purchasing.</p>
      <Link href="/auth/signin?callbackUrl=%2Fbilling" className="inline-block rounded-md border border-border px-5 py-3">Sign in to review your plan</Link>
    </div>
  )
}
