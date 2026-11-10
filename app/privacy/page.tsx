import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument, LegalSection } from '@/components/legal-document'
import { LEGAL_LAST_UPDATED, formatLegalDate, getLegalDetails } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What data this service collects, why, and the choices you have.',
}

export default function PrivacyPage() {
  const { productName, operatorName, contactEmail } = getLegalDetails()
  const operator = operatorName ?? 'the operator of this service'

  return (
    <LegalDocument title="Privacy Policy" lastUpdated={formatLegalDate(LEGAL_LAST_UPDATED)}>
      <LegalSection heading="1. Who this covers">
        <p>
          This policy explains how {operator} (&quot;we&quot;, &quot;us&quot;)
          handles personal information in {productName} (the
          &quot;service&quot;). It applies together with the{' '}
          <Link className="text-primary hover:underline" href="/terms">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account information.</strong> Your name, email address, and
            profile image as supplied by the sign-in provider you choose (Google
            or GitHub). Accounts that sign in with a password have a one-way
            hash of that password stored. We never store the password itself.
          </li>
          <li>
            <strong>Your workspace content.</strong> Conversations and messages,
            including the prompts you send and the responses returned, plus the
            personas and goals you create.
          </li>
          <li>
            <strong>AI provider API keys.</strong> Keys you save are encrypted
            (AES-256-GCM) before they are stored and are never shown back to you
            in full or sent to your browser after saving.
          </li>
          <li>
            <strong>Usage records.</strong> Which provider and model handled a
            request, token counts, timing, errors, and product events such as
            creating a persona or opening the Billing page. These records are
            linked to your account. They power your own Analytics page and plan
            allowances and help us operate and improve the service.
          </li>
          <li>
            <strong>Billing information.</strong> If you subscribe, Stripe
            collects your payment details. We store a Stripe customer
            identifier, your plan, and your subscription status. We do not
            receive or store your full card number.
          </li>
          <li>
            <strong>Technical and security data.</strong> Server logs and
            rate-limiting records, which can include your account identifier and
            network address, used to keep the service secure and to prevent
            abuse.
          </li>
          <li>
            <strong>Referral details.</strong> If you arrive through a link that
            contains source, campaign, or cohort labels, those labels are kept
            in a cookie and may be recorded with your account events.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. How we use information">
        <ul className="list-disc space-y-2 pl-5">
          <li>to provide the service, including sending your prompts to the AI providers you select;</li>
          <li>to authenticate you and keep your account secure;</li>
          <li>to process subscriptions and apply plan allowances;</li>
          <li>to measure usage, diagnose problems, and improve the service;</li>
          <li>to prevent abuse and to comply with the law.</li>
        </ul>
        <p>
          We do not sell your personal information. We do not use your content to
          train AI models. We do not use third-party advertising or analytics
          trackers.
        </p>
      </LegalSection>

      <LegalSection heading="4. When information is shared">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>AI providers you choose.</strong> When you run a prompt, the
            prompt, any persona instructions, and the relevant conversation
            history are sent to each provider you selected, using your own API
            key. Each provider handles that data under its own terms and privacy
            policy, including how long it keeps the data and whether it uses the
            data to train models. Review the terms of any provider you connect.
          </li>
          <li>
            <strong>Sign-in providers.</strong> Google or GitHub, when you use
            them to sign in.
          </li>
          <li>
            <strong>Payment processor.</strong> Stripe, to process subscription
            payments.
          </li>
          <li>
            <strong>Infrastructure providers.</strong> The hosting and database
            providers that run the service and store its data on our behalf.
          </li>
          <li>
            <strong>Legal reasons.</strong> When required by law, or to protect
            the rights, safety, or security of users or the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Cookies and browser storage">
        <ul className="list-disc space-y-2 pl-5">
          <li>a session cookie that keeps you signed in, required for the service to work;</li>
          <li>a referral cookie, only if you arrived through a labeled link;</li>
          <li>browser storage for display preferences such as theme and font size.</li>
        </ul>
        <p>The service does not use advertising cookies.</p>
      </LegalSection>

      <LegalSection heading="6. How long we keep information">
        <p>
          We keep your account and workspace data until you delete it or delete
          your account. You can delete individual conversations, personas, goals,
          and saved API keys at any time. Deleting your account removes your
          account, workspace content, saved keys, and usage records from the
          live database. Copies can remain in database backups for a limited
          time until those backups expire. Payment and invoice records are kept
          by Stripe as required for financial record keeping.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your choices and rights">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Access and export.</strong> Download an archive of your conversations from Settings.</li>
          <li><strong>Correction.</strong> Update your display name in Settings.</li>
          <li><strong>Deletion.</strong> Permanently delete your account and its data from Settings.</li>
          <li><strong>Billing.</strong> Manage or cancel a subscription from the Billing page.</li>
        </ul>
        <p>
          Depending on where you live, you may have additional rights over your
          personal information, such as the right to object to or restrict
          certain processing or to complain to a data protection authority.
          {contactEmail ? ' Contact us to exercise a right that is not available in the service itself.' : ''}
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          We protect data with encryption in transit, encryption of saved API
          keys, hashed passwords, per-account access checks on every request,
          and rate limiting. No system is perfectly secure, and we cannot
          guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>
          The service is not intended for anyone under 18, and we do not
          knowingly collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection heading="10. International processing">
        <p>
          Your information may be processed in countries other than the one you
          live in, including where our infrastructure providers and the AI
          providers you choose operate.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes to this policy">
        <p>
          We may update this policy. The date at the top shows the latest
          version. If a change is significant we will give notice in the
          service.
        </p>
      </LegalSection>

      {contactEmail ? (
        <LegalSection heading="12. Contact">
          <p>
            Privacy questions and requests:{' '}
            <a className="text-primary hover:underline" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          </p>
        </LegalSection>
      ) : null}
    </LegalDocument>
  )
}
