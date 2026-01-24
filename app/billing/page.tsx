import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BillingClient } from './billing-client'
import { prisma } from '@/lib/prisma'

// Define the type for subscription tier as string
type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';

/**
 * Server page to handle billing and subscription management.
 */
export default async function BillingPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/billing')
  }

  // Get the user's subscription directly from the DB
  const subscription = await prisma.subscription.findUnique({
    where: {
      userId: session.user.id,
    },
    select: {
      tier: true,
      stripeCurrentPeriodEnd: true,
    },
  })

  const tier = subscription?.tier || 'FREE'

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Billing & Subscription</CardTitle>
            <Badge variant="secondary">{tier}</Badge>
          </div>
          <p className="text-muted-foreground">
            Manage your subscription plan and billing details.
          </p>
        </CardHeader>
        <CardContent>
          <BillingClient
            tier={tier as SubscriptionTier}
            periodEnd={subscription?.stripeCurrentPeriodEnd?.toLocaleDateString() || null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
