'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'

// Define the type for subscription tier as string
type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';

interface BillingClientProps {
  tier: SubscriptionTier
  periodEnd: string | null
}

export function BillingClient({ tier, periodEnd }: BillingClientProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleManageSubscription = async () => {
    setIsLoading(true)
    try {
      // Call the API route to create a Stripe customer portal session
      const response = await fetch('/api/subscriptions/manage', {
        method: 'POST'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create portal session')
      }

      const { url } = await response.json()
      if (url) {
        // Redirect to the Stripe Customer Portal
        window.location.href = url
      } else {
        throw new Error('No redirect URL received')
      }
    } catch (error) {
      console.error('Error redirecting to Stripe portal:', error)
      alert('Error redirecting to billing portal. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted/50 rounded-lg">
        <h3 className="text-lg font-semibold">Current Plan</h3>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={tier === 'PRO' ? 'default' : 'outline'}>
            {tier}
          </Badge>
          {tier === 'PRO' && periodEnd && (
            <p className="text-sm text-muted-foreground">
              Renews on {periodEnd}
            </p>
          )}
          {tier === 'FREE' && (
            <p className="text-sm text-muted-foreground">
              You are on the free plan.
            </p>
          )}
        </div>
      </div>

      <Button onClick={handleManageSubscription} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Manage Subscription'}
      </Button>
    </div>
  )
}