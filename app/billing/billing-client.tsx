'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BillingPlan, BillingPlanId } from '@/lib/billing-plans'

type SubscriptionTier = BillingPlanId

interface BillingClientProps {
  tier: SubscriptionTier
  status?: string | null
  cancelAtPeriodEnd?: boolean
  hasBillingAccount?: boolean
  quota?: { limit: number | null; used: number; resetsAt: string } | null
  proPriceLabel?: string
  periodEnd: string | null
  plans: BillingPlan[]
  freePlanWeeklySavedBriefGuidance: number
  weeklySavedBriefComparisons: number
  checkoutEnabled: boolean
  portalEnabled: boolean
}

const formatPeriodEnd = (periodEnd: string | null) => {
  if (!periodEnd) {
    return null
  }

  const parsed = new Date(periodEnd)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function BillingClient({
  tier,
  periodEnd,
  status, cancelAtPeriodEnd, hasBillingAccount, quota, proPriceLabel,
  plans,
  freePlanWeeklySavedBriefGuidance,
  weeklySavedBriefComparisons,
  checkoutEnabled,
  portalEnabled,
}: BillingClientProps) {
  const [isLoading, setIsLoading] = useState<'checkout' | 'portal' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const hasTrackedBillingView = useRef(false)

  const formattedPeriodEnd = useMemo(() => formatPeriodEnd(periodEnd), [periodEnd])
  const shouldRecommendUpgrade =
    tier === 'FREE' &&
    weeklySavedBriefComparisons >= freePlanWeeklySavedBriefGuidance

  useEffect(() => {
    if (hasTrackedBillingView.current) {
      return
    }

    hasTrackedBillingView.current = true
    void fetch('/api/billing/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'billing_page' }),
    }).catch(() => {
      // Billing view telemetry is best effort only.
    })
  }, [])

  const handleUpgrade = async () => {
    setIsLoading('checkout')
    setActionError(null)

    try {
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create subscription session')
      }

      const { url } = await response.json()
      if (!url) {
        throw new Error('No redirect URL received')
      }

      window.location.href = url
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to create subscription session'
      )
    } finally {
      setIsLoading(null)
    }
  }

  const handleManageSubscription = async () => {
    setIsLoading('portal')
    setActionError(null)

    try {
      const response = await fetch('/api/subscriptions/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'billing_page' }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create portal session')
      }

      const { url } = await response.json()
      if (!url) {
        throw new Error('No redirect URL received')
      }

      window.location.href = url
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to create portal session'
      )
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={tier === 'PRO' ? 'default' : 'outline'}>{tier}</Badge>
            {tier === 'PRO' && formattedPeriodEnd ? (
              <p className="text-sm text-muted-foreground">
                {cancelAtPeriodEnd ? 'Access ends on' : 'Renews on'} {formattedPeriodEnd}
              </p>
            ) : null}
            {tier === 'FREE' ? (
              <p className="text-sm text-muted-foreground">
                {weeklySavedBriefComparisons} weekly saved brief comparisons tracked.
              </p>
            ) : null}
          </div>
          {status && ['past_due', 'unpaid', 'incomplete', 'paused'].includes(status) ? <p role="status" className="text-sm text-destructive">Payment needs attention. Update your payment details in the billing portal.</p> : null}
          {quota ? <p className="text-sm">{quota.used} of {quota.limit ?? 'unlimited'} monthly generations used. Resets {formatPeriodEnd(quota.resetsAt)}. Failed and stopped attempts count toward this allowance.</p> : null}
          {shouldRecommendUpgrade ? (
            <p className="text-sm font-medium text-amber-600">
              Upgrade recommended: the free-plan guidance threshold has been reached for this week.
            </p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {tier === 'FREE' ? (
              <Button
                onClick={handleUpgrade}
                disabled={isLoading !== null || !checkoutEnabled}
              >
                {isLoading === 'checkout' ? 'Starting checkout...' : 'Upgrade to Pro'}
              </Button>
            ) : null}
            {tier === 'PRO' || hasBillingAccount ? (
              <Button
                onClick={handleManageSubscription}
                disabled={isLoading !== null || !portalEnabled}
              >
                {isLoading === 'portal' ? 'Opening portal...' : 'Manage Subscription'}
              </Button>
            ) : null}
          </div>
          {!checkoutEnabled && tier === 'FREE' ? (
            <p className="text-sm text-muted-foreground">
              Checkout is currently unavailable because Stripe checkout is not configured.
            </p>
          ) : null}
          {!portalEnabled && tier === 'PRO' ? (
            <p className="text-sm text-muted-foreground">
              Billing portal is currently unavailable because Stripe API access is not configured.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => {
          const isCurrentPlan = plan.id === tier
          return (
            <Card key={plan.id} className={isCurrentPlan ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.label}</CardTitle>
                  {isCurrentPlan ? <Badge>Current</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {plan.id === 'PRO' && proPriceLabel ? <p className="font-medium text-foreground">{proPriceLabel}</p> : null}
                <p>{plan.summary}</p>
                <p>{plan.weeklySavedBriefComparisonGuidance}</p>
                <p>Analytics: {plan.analyticsAccess}</p>
                <p>Personas: {plan.personaAccess}</p>
                <p>Comparison: {plan.comparisonAccess}</p>
                <p>Subscription model: {plan.subscriptionModel}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
