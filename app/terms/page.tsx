import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument, LegalSection } from '@/components/legal-document'
import { LEGAL_LAST_UPDATED, formatLegalDate, getLegalDetails } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern use of this service.',
}

export default function TermsPage() {
  const { productName, operatorName, contactEmail, governingLaw } = getLegalDetails()
  const operator = operatorName ?? 'the operator of this service'

  return (
    <LegalDocument title="Terms of Service" lastUpdated={formatLegalDate(LEGAL_LAST_UPDATED)}>
      <LegalSection heading="1. Agreement">
        <p>
          These terms are an agreement between you and {operator} (&quot;we&quot;,
          &quot;us&quot;) covering your use of {productName} (the
          &quot;service&quot;). By creating an account or using the service you
          agree to these terms and to the{' '}
          <Link className="text-primary hover:underline" href="/privacy">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection heading="2. The service">
        <p>
          {productName} is a workspace for sending the same prompt to several
          AI model providers, comparing the responses, reusing personas, and
          keeping a history of that work. The service connects to third-party
          AI providers on your behalf. It does not provide the AI models
          themselves.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts and eligibility">
        <ul className="list-disc space-y-2 pl-5">
          <li>You must be at least 18 years old and able to enter into a binding agreement.</li>
          <li>You are responsible for activity under your account and for keeping your sign-in method secure.</li>
          <li>Give accurate account information and use one account per person.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Your AI provider keys and third-party providers">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            You connect your own API keys for the AI providers you choose. Requests
            made through the service are sent to those providers using your keys.
          </li>
          <li>
            Your use of each provider is governed by that provider&apos;s own
            terms and pricing. Charges from a provider for usage on your key are
            between you and that provider and are your responsibility.
          </li>
          <li>
            Only connect keys you are authorized to use. You can remove a saved key
            at any time in Settings.
          </li>
          <li>
            We are not responsible for the availability, pricing, behavior, or
            output of any third-party provider.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Your content">
        <p>
          You keep ownership of the prompts, personas, and other material you
          submit, and of the responses returned to you, to the extent the law and
          the relevant provider&apos;s terms allow. You give us permission to
          store, process, and transmit that content only as needed to operate the
          service for you. You are responsible for having the rights to anything
          you submit.
        </p>
      </LegalSection>

      <LegalSection heading="6. AI output">
        <p>
          AI responses can be inaccurate, incomplete, biased, or out of date, and
          different providers can give different answers to the same prompt.
          Review output before relying on it. Output is not professional advice,
          including legal, medical, or financial advice.
        </p>
      </LegalSection>

      <LegalSection heading="7. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>break the law or infringe the rights of others;</li>
          <li>use the service in a way that violates the usage policies of an AI provider you have connected;</li>
          <li>attempt to access another user&apos;s account, data, or API keys;</li>
          <li>probe, overload, or bypass the security, rate limits, or usage allowances of the service;</li>
          <li>resell or provide the service to third parties without our written permission.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="8. Plans and billing">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            The service has a free plan and a paid Pro plan. The current price and
            any monthly usage allowance for each plan are shown on the Billing page
            before you subscribe.
          </li>
          <li>
            Pro is a subscription that renews automatically each billing period
            until you cancel. Payments are processed by Stripe. We do not receive
            or store your full card details.
          </li>
          <li>
            You can cancel at any time from the Billing page. Cancelling there
            stops future renewals and your paid access continues until the end of
            the period you have already paid for.
          </li>
          <li>
            Deleting your account cancels your subscription immediately.
          </li>
          <li>
            Payments are not refundable, including for a partly used billing
            period, except where the law requires a refund.
          </li>
          <li>
            Where a plan has a monthly allowance, each attempted generation counts
            toward it, including attempts that fail or that you stop.
          </li>
          <li>
            A subscription fee pays for the service only. It does not include
            usage charges from AI providers on your own keys.
          </li>
          <li>
            We may change prices for future billing periods and will give notice
            before a change applies to you.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="9. Experimental features">
        <p>
          Some features are marked experimental. They may change, break, or be
          removed without notice.
        </p>
      </LegalSection>

      <LegalSection heading="10. Ending your use">
        <p>
          You can stop using the service at any time and can permanently delete
          your account and its data from Settings. We may suspend or end access
          for an account that breaks these terms or creates risk for the service
          or other users.
        </p>
      </LegalSection>

      <LegalSection heading="11. Disclaimers">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;,
          without warranties of any kind, whether express or implied, including
          warranties of merchantability, fitness for a particular purpose, and
          non-infringement, to the fullest extent the law allows. We do not
          promise that the service will be uninterrupted or error free.
        </p>
      </LegalSection>

      <LegalSection heading="12. Limitation of liability">
        <p>
          To the fullest extent the law allows, we are not liable for indirect,
          incidental, special, consequential, or punitive damages, or for lost
          profits, revenue, or data. Our total liability for any claim relating
          to the service is limited to the amount you paid us for the service in
          the 12 months before the claim arose. Nothing in these terms limits
          liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to these terms">
        <p>
          We may update these terms. The date at the top shows the latest
          version. If a change is significant we will give notice in the service.
          Continuing to use the service after a change takes effect means you
          accept the updated terms.
        </p>
      </LegalSection>

      {governingLaw ? (
        <LegalSection heading="14. Governing law">
          <p>
            These terms are governed by the laws of {governingLaw}, without
            regard to conflict-of-law rules. This does not remove consumer
            protections you are entitled to where you live.
          </p>
        </LegalSection>
      ) : null}

      {contactEmail ? (
        <LegalSection heading={governingLaw ? '15. Contact' : '14. Contact'}>
          <p>
            Questions about these terms:{' '}
            <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          </p>
        </LegalSection>
      ) : null}
    </LegalDocument>
  )
}
