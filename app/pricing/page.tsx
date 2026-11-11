import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getAppName } from '@/lib/app-name'
import { describePlanAllowance, getBillingPlan } from '@/lib/billing-plans'
import { getLegalDetails } from '@/lib/legal'
import { getPublicOffer } from '@/lib/public-pricing'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Plans for running one brief across several AI providers and comparing the answers side by side.',
}

const WORKFLOW = [
  {
    title: 'One brief, several providers',
    body: 'Send the same prompt to the AI providers you choose and read the answers side by side.',
  },
  {
    title: 'Reusable personas',
    body: 'Save the instructions you rely on and apply them to any comparison instead of retyping them.',
  },
  {
    title: 'History you can return to',
    body: 'Every comparison is saved to your account, with analytics on what you ran and how it performed.',
  },
]

export default async function PricingPage() {
  const offer = await getPublicOffer()
  const { contactEmail } = getLegalDetails()
  const appName = getAppName()
  const free = getBillingPlan('FREE')
  const pro = getBillingPlan('PRO')
  const freeAllowance = describePlanAllowance('FREE', offer.allowances)
  const proAllowance = describePlanAllowance('PRO', offer.allowances)

  return (
    <div className="container mx-auto max-w-5xl space-y-12 px-4 py-12">
      <header className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Compare AI providers on your own briefs
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          {appName} runs one brief across the AI providers you connect, shows the
          answers side by side, and keeps the history so the comparison is
          repeatable.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/auth/register">Create an account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <section aria-labelledby="how-it-works" className="space-y-4">
        <h2 id="how-it-works" className="text-xl font-semibold">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {WORKFLOW.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="plans" className="space-y-4">
        <h2 id="plans" className="text-xl font-semibold">Plans</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{free.label}</CardTitle>
              <CardDescription>{free.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-2xl font-semibold">No charge</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {freeAllowance ? <li>{freeAllowance}</li> : null}
                <li>{free.comparisonAccess}</li>
                <li>{free.personaAccess}</li>
                <li>{free.analyticsAccess}</li>
              </ul>
              <Button asChild variant="outline" className="w-full">
                <Link href="/auth/register">Start free</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/60">
            <CardHeader>
              <CardTitle>{pro.label}</CardTitle>
              <CardDescription>{pro.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {offer.checkoutOpen && offer.proPriceLabel ? (
                <p className="text-2xl font-semibold">{offer.proPriceLabel}</p>
              ) : (
                <p className="text-2xl font-semibold">Not open yet</p>
              )}
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {proAllowance ? <li>{proAllowance}</li> : null}
                <li>{pro.comparisonAccess}</li>
                <li>{pro.personaAccess}</li>
                <li>{pro.analyticsAccess}</li>
                {offer.checkoutOpen ? (
                  <li>Renews automatically. Cancel any time from the Billing page.</li>
                ) : null}
              </ul>
              {offer.checkoutOpen ? (
                <Button asChild className="w-full">
                  <Link href="/auth/signin?callbackUrl=%2Fbilling">Sign in to subscribe</Link>
                </Button>
              ) : (
                <p className="text-muted-foreground">
                  Paid subscriptions are not open yet. You can use the free plan today.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="good-to-know" className="space-y-3 text-sm text-muted-foreground">
        <h2 id="good-to-know" className="text-xl font-semibold text-foreground">Good to know</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You connect your own API keys. Usage charges from each AI provider are
            billed by that provider and are not included in any plan here.
          </li>
          {offer.allowances ? (
            <li>
              A generation is one attempted model response. Attempts that fail or
              that you stop still count toward the monthly allowance, which resets
              at the start of each calendar month (UTC).
            </li>
          ) : null}
          <li>
            Saved API keys are encrypted, and you can export your data or delete
            your account from Settings at any time.
          </li>
          <li>
            Renewal, cancellation and refund terms are in the{' '}
            <Link className="text-primary hover:underline" href="/terms">Terms of Service</Link>.
            How data is handled is in the{' '}
            <Link className="text-primary hover:underline" href="/privacy">Privacy Policy</Link>.
          </li>
          {contactEmail ? (
            <li>
              Need something larger for a team?{' '}
              <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>
                Contact us
              </a>
              .
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
