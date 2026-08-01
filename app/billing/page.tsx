import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BillingClient } from './billing-client'
import { ConversationService } from '@/services/conversation-service.db'
import {
  BILLING_PLANS,
  FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE,
} from '@/lib/billing-plans'
import { isStripeApiConfigured, isStripeCheckoutConfigured } from '@/lib/stripe'

type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE'

export default async function BillingPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/billing')
  }

  const userId = session.user.id
  const weeklySavedBriefComparisons = userId
    ? await ConversationService.getWeeklySavedBriefComparisonCountForRollingDays(
        userId,
        7
      )
    : 0

  const tier: SubscriptionTier =
    (session.user.tier as SubscriptionTier | undefined) || 'FREE'

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Billing & Subscription</CardTitle>
            <Badge variant="secondary">{tier}</Badge>
          </div>
          <p className="text-muted-foreground">
            Review the current plan model, see how billing maps to workflow usage,
            and take the next billing action from one page.
          </p>
        </CardHeader>
        <CardContent>
          <BillingClient
            tier={tier}
            periodEnd={null}
            plans={BILLING_PLANS}
            freePlanWeeklySavedBriefGuidance={FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE}
            weeklySavedBriefComparisons={weeklySavedBriefComparisons}
            checkoutEnabled={isStripeCheckoutConfigured}
            portalEnabled={isStripeApiConfigured}
          />
        </CardContent>
      </Card>
    </div>
  )
}
