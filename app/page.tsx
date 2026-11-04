import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { BYOK_COPY } from '@/lib/release-offer'
import { isPaidSignupEnabled } from '@/lib/legal-publication'

export default async function ProductPage() {
  const session = await auth()
  if (session?.user?.id) redirect(session.user.deletionPending ? '/account/deletion' : '/workspace')
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-5 py-12 md:py-20">
      <section className="max-w-3xl space-y-6">
        <p className="text-sm font-medium text-muted-foreground">MultiLLM Chat Assistant · BYOK comparison workspace</p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">One brief. Several model perspectives.</h1>
        <p className="text-lg text-muted-foreground">Send the same brief to your selected models, compare the results, save the conversation, and return to it later. Reuse personas for work you do repeatedly.</p>
        <p>{BYOK_COPY}</p>
        {!isPaidSignupEnabled() ? <p role="status" className="rounded-lg border border-border p-4">Paid signup is not open yet. This workspace is being prepared for a limited release.</p> : null}
        <div className="flex flex-wrap gap-4">
          <Link href="/auth/signin?callbackUrl=%2Fworkspace" className="rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground">Sign in</Link>
          <Link href="/pricing" className="rounded-md border border-border px-5 py-3">See price and allowances</Link>
        </div>
      </section>
      <section aria-labelledby="example-title" className="rounded-xl border border-border bg-card p-6 md:p-8">
        <h2 id="example-title" className="mb-4 text-2xl font-semibold">A comparison you can return to</h2>
        <p className="mb-4 text-sm text-muted-foreground">Illustrative workflow, not a customer testimonial or a claimed model result.</p>
        <blockquote className="border-l-2 border-primary pl-4">Review this client proposal. Identify unclear deliverables, delivery risks, and three questions to ask before accepting it.</blockquote>
        <ol className="mt-6 list-decimal space-y-3 pl-5">
          <li>Add and test your provider API keys in Settings.</li>
          <li>Choose two to four models and send the brief once. Single chat is also available.</li>
          <li>Compare the responses, stop a running response if needed, and keep successful results when a sibling fails.</li>
          <li>Reopen the saved conversation, continue it, or apply a reusable persona.</li>
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">For people who already use provider APIs</h2>
        <p className="max-w-3xl text-muted-foreground">Designed for independent consultants and small agencies comparing responses for repeatable briefs. A ChatGPT, Claude, or Gemini consumer subscription is not an API credential.</p>
        <p><Link className="underline" href="/privacy">Read the privacy notice</Link> and <Link className="underline" href="/terms">terms</Link> before using the workspace. <Link className="underline" href="/support">Support information</Link> is listed separately.</p>
      </section>
    </div>
  )
}
