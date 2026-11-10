import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument, LegalSection } from '@/components/legal-document'
import { getAppName } from '@/lib/app-name'
import { LEGAL_LAST_UPDATED, formatLegalDate, getLegalDetails } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Support',
  description: 'How to manage your account, billing and data, and how to get help.',
}

export default function SupportPage() {
  const { contactEmail } = getLegalDetails()
  const appName = getAppName()

  return (
    <LegalDocument title="Support" lastUpdated={formatLegalDate(LEGAL_LAST_UPDATED)}>
      <LegalSection heading="Do it yourself">
        <p>Most account tasks in {appName} do not need a support request:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Change or cancel a subscription.</strong> Open Billing and
            choose Manage subscription. Cancelling stops future renewals; paid
            access continues to the end of the period already paid for.
          </li>
          <li>
            <strong>Update a payment method or get invoices.</strong> Open
            Billing and choose Manage subscription to reach the billing portal.
          </li>
          <li>
            <strong>Add, replace or remove an AI provider key.</strong> Open
            Settings, API Providers. Keys are encrypted and never shown in full
            after saving.
          </li>
          <li>
            <strong>Check a key that is not working.</strong> Open API Test to
            verify a key directly against the provider.
          </li>
          <li>
            <strong>Download your data.</strong> Open Settings, Advanced, for a
            copy of your account data and an encrypted conversation archive.
          </li>
          <li>
            <strong>Delete your account.</strong> Open Settings, Advanced,
            Delete Account. This is permanent and cancels any subscription.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Common questions">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Why was I charged by an AI provider?</strong> Requests run on
            your own provider API keys, and each provider bills you directly for
            that usage. Plan fees here do not include it.
          </li>
          <li>
            <strong>Why did a generation count when it failed?</strong> Each
            attempted generation counts toward a monthly allowance, including
            attempts that fail or that you stop.
          </li>
          <li>
            <strong>When does my allowance reset?</strong> At the start of each
            calendar month (UTC). The Billing page shows the exact time.
          </li>
          <li>
            <strong>I cannot sign in.</strong> Use the same sign-in provider you
            registered with. An account created with Google cannot be opened
            with GitHub, and the reverse.
          </li>
        </ul>
      </LegalSection>

      {contactEmail ? (
        <LegalSection heading="Contact">
          <p>
            For anything not covered above, including billing disputes, privacy
            requests and security reports, write to{' '}
            <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
            . Never send an API key or password by email.
          </p>
        </LegalSection>
      ) : null}

      <LegalSection heading="Policies">
        <p>
          <Link className="text-primary hover:underline" href="/pricing">Pricing</Link>
          {' · '}
          <Link className="text-primary hover:underline" href="/terms">Terms of Service</Link>
          {' · '}
          <Link className="text-primary hover:underline" href="/privacy">Privacy Policy</Link>
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
