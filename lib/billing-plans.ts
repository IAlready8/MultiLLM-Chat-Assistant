import { RELEASE_OFFER } from '@/lib/release-offer'

export type BillingPlanId = 'FREE' | 'PRO' | 'ENTERPRISE'

export type BillingPlan = {
  id: BillingPlanId
  label: string
  summary: string
  subscriptionModel: 'none' | 'stripe-self-serve' | 'sales-led'
  allowanceDescription: string
  analyticsAccess: string
  personaAccess: string
  comparisonAccess: string
  selfServe: boolean
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'FREE',
    label: 'Free',
    summary: 'Baseline access for validating one repeatable comparison workflow.',
    subscriptionModel: 'none',
    allowanceDescription: `${RELEASE_OFFER.limits.FREE} attempted provider generations per UTC calendar month.`,
    analyticsAccess: 'Core workflow telemetry and activation progress.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: false,
  },
  {
    id: 'PRO',
    label: 'Pro',
    summary: 'A monthly BYOK workspace subscription. Cancel renewal and retain Pro access through the paid-through date.',
    subscriptionModel: 'stripe-self-serve',
    allowanceDescription: `${RELEASE_OFFER.limits.PRO.toLocaleString('en-CA')} attempted provider generations per UTC calendar month. ${RELEASE_OFFER.priceLabel}.`,
    analyticsAccess: 'Full workflow analytics, billing portal access, and paid subscription lifecycle.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: true,
  },
]

export const getBillingPlan = (id: BillingPlanId): BillingPlan =>
  BILLING_PLANS.find(plan => plan.id === id) ?? BILLING_PLANS[0]
