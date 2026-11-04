import { getLlmQuota } from '@/lib/llm-quota'
import { getProPrice } from '@/lib/billing-price'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BillingClient } from './billing-client'
import { BILLING_PLANS } from '@/lib/billing-plans'
import { isStripeApiConfigured, isStripeCheckoutConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE'

export default async function BillingPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/billing')
  }

  const userId = session.user.id
  const [subscription, quota, proPrice] = await Promise.all([
    userId
      ? prisma.subscription.findUnique({
          where: { userId },
          select: {
            tier: true,
            stripeStatus: true,
            stripeCancelAtPeriodEnd: true,
            stripeCustomerId: true,
            stripeCurrentPeriodEnd: true,
          },
        })
      : null,
    userId ? getLlmQuota(userId) : null,
    isStripeCheckoutConfigured ? getProPrice().catch(() => null) : null,
  ])

  const tier: SubscriptionTier = quota?.tier ?? 'FREE'

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Billing & Subscription</CardTitle>
            <Badge variant="secondary">{tier}</Badge>
          </div>
          <p className="text-muted-foreground">
            Review the current plan model, see how billing maps to workflow
            usage, and take the next billing action from one page.
          </p>
        </CardHeader>
        <CardContent>
          <BillingClient
            tier={tier}
            status={subscription?.stripeStatus}
            cancelAtPeriodEnd={subscription?.stripeCancelAtPeriodEnd}
            hasBillingAccount={Boolean(subscription?.stripeCustomerId)}
            quota={quota}
            proPriceLabel={proPrice?.label}
            periodEnd={
              subscription?.stripeCurrentPeriodEnd?.toISOString() || null
            }
            plans={BILLING_PLANS}
            checkoutEnabled={isStripeCheckoutConfigured && Boolean(proPrice)}
            portalEnabled={isStripeApiConfigured}
          />
        </CardContent>
      </Card>
    </div>
  )
}
