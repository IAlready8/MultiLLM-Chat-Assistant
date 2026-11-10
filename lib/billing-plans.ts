export type BillingPlanId = 'FREE' | 'PRO' | 'ENTERPRISE'

export type BillingPlan = {
  id: BillingPlanId
  label: string
  summary: string
  subscriptionModel: 'none' | 'stripe-self-serve' | 'sales-led'
  /** Customer-facing description of how this plan is obtained and billed. */
  billingSummary: string
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
    billingSummary: 'No payment required.',
    weeklySavedBriefComparisonGuidance: 'Best fit for up to 3 weekly saved brief comparisons.',
    analyticsAccess: 'Core workflow telemetry and activation progress.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: false,
  },
  {
    id: 'PRO',
    label: 'Pro',
    summary: 'For consultants and boutique agencies running repeatable client briefs.',
    subscriptionModel: 'stripe-self-serve',
    billingSummary: 'Billed by subscription. Cancel any time from this page.',
    weeklySavedBriefComparisonGuidance: 'Designed for ongoing tracked comparison work without the free-plan guidance ceiling.',
    analyticsAccess: 'Full workflow analytics.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: true,
  },
  {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    summary: 'Custom access for larger teams, arranged directly with us.',
    subscriptionModel: 'sales-led',
    billingSummary: 'Arranged directly with us. Not available through self-serve checkout.',
    weeklySavedBriefComparisonGuidance: 'Limits agreed for your team.',
    analyticsAccess: 'Full workflow analytics.',
    personaAccess: 'Reusable personas supported.',
    comparisonAccess: 'Multi-provider comparison available.',
    selfServe: false,
  },
]

export const FREE_PLAN_WEEKLY_SAVED_BRIEF_GUIDANCE = 3

export const getBillingPlan = (id: BillingPlanId): BillingPlan =>
  BILLING_PLANS.find(plan => plan.id === id) ?? BILLING_PLANS[0]

export type PlanAllowances = Record<BillingPlanId, number | null>

/**
 * The enforced monthly generation allowance for a plan, as a customer reads it.
 * Returns null when no allowances are configured, so the page never states a
 * limit that the server is not enforcing.
 */
export const describePlanAllowance = (
  planId: BillingPlanId,
  allowances: PlanAllowances | null | undefined,
): string | null => {
  if (!allowances) return null
  const limit = allowances[planId]
  if (limit === null) return 'Unlimited generations per month.'
  return `${limit.toLocaleString('en-US')} generations per month.`
}
