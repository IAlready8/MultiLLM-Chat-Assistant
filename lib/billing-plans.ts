export type BillingPlanId = 'FREE' | 'PRO' | 'ENTERPRISE'

export type BillingPlan = {
  id: BillingPlanId
  label: string
  summary: string
  subscriptionModel: 'none' | 'stripe-self-serve' | 'sales-led'
  weeklySavedBriefComparisonGuidance: string
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
    weeklySavedBriefComparisonGuidance: 'Best fit for up to 3 weekly saved brief comparisons.',
    analyticsAccess: 'Core workflow telemetry and activation progress.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: false,
  },
  {
    id: 'PRO',
    label: 'Pro',
    summary: 'Paid Stripe subscription for consultants and boutique agencies running repeatable client briefs.',
    subscriptionModel: 'stripe-self-serve',
    weeklySavedBriefComparisonGuidance: 'Designed for ongoing tracked comparison work without the free-plan guidance ceiling.',
    analyticsAccess: 'Full workflow analytics, billing portal access, and paid subscription lifecycle.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: true,
  },
  {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    summary: 'Operator-managed or sales-led access, not exposed as self-serve checkout in this product line.',
    subscriptionModel: 'sales-led',
    weeklySavedBriefComparisonGuidance: 'Custom operational limits and rollout decisions.',
    analyticsAccess: 'Operator-managed.',
    personaAccess: 'Operator-managed.',
    comparisonAccess: 'Operator-managed.',
    selfServe: false,
  },
]

export const FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE = 3

export const getBillingPlan = (id: BillingPlanId): BillingPlan =>
  BILLING_PLANS.find(plan => plan.id == id) ?? BILLING_PLANS[0]
