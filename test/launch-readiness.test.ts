import { describe, expect, it } from 'vitest'
import { getLaunchReadiness } from '@/lib/launch-readiness'
import { describePlanAllowance } from '@/lib/billing-plans'

const ready = {
  STRIPE_SECRET_KEY: 'sk_test_value',
  STRIPE_PRO_PRICE_ID: 'price_test',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  LLM_MONTHLY_REQUEST_LIMITS: '{"FREE":50,"PRO":2000,"ENTERPRISE":null}',
  SUPPORT_EMAIL: 'support@example.test',
  LEGAL_ENTITY_NAME: 'Example Labs Inc.',
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
}

const ids = (env: Record<string, string | undefined>) =>
  getLaunchReadiness(env).findings.map((finding) => finding.id)

describe('getLaunchReadiness', () => {
  it('reports ok for a fully configured paid launch', () => {
    expect(getLaunchReadiness(ready)).toEqual({ status: 'ok', findings: [] })
  })

  it('warns when checkout is on but no allowance separates Free from Pro', () => {
    const result = getLaunchReadiness({ ...ready, LLM_MONTHLY_REQUEST_LIMITS: undefined })
    expect(result.status).toBe('warning')
    expect(ids({ ...ready, LLM_MONTHLY_REQUEST_LIMITS: '  ' })).toEqual(['paid-plan-without-limits'])
  })

  it.each([
    '{"FREE":100,"PRO":100,"ENTERPRISE":null}',
    '{"FREE":100,"PRO":50,"ENTERPRISE":null}',
    '{"FREE":null,"PRO":500,"ENTERPRISE":null}',
    '{"FREE":null,"PRO":null,"ENTERPRISE":null}',
  ])('warns when Pro is not better than Free: %s', (limits) => {
    expect(ids({ ...ready, LLM_MONTHLY_REQUEST_LIMITS: limits })).toEqual(['pro-not-better-than-free'])
  })

  it('accepts an unlimited Pro plan over a limited Free plan', () => {
    expect(ids({ ...ready, LLM_MONTHLY_REQUEST_LIMITS: '{"FREE":25,"PRO":null,"ENTERPRISE":null}' })).toEqual([])
  })

  it.each(['not json', '[]', '{"FREE":1}', '{"FREE":-1,"PRO":2,"ENTERPRISE":null}', '{"FREE":1.5,"PRO":2,"ENTERPRISE":null}', '{"FREE":1,"PRO":2,"ENTERPRISE":null,"EXTRA":3}'])(
    'flags invalid plan limits as an error: %s',
    (limits) => {
      const result = getLaunchReadiness({ ...ready, LLM_MONTHLY_REQUEST_LIMITS: limits })
      expect(result.status).toBe('error')
      expect(result.findings.map((finding) => finding.id)).toEqual(['plan-limits-invalid'])
    },
  )

  it('flags checkout without a webhook secret as an error', () => {
    const result = getLaunchReadiness({ ...ready, STRIPE_WEBHOOK_SECRET: '' })
    expect(result.status).toBe('error')
    expect(result.findings.map((finding) => finding.id)).toContain('checkout-without-webhook')
  })

  it('does not ask for billing configuration when billing is off', () => {
    expect(
      ids({ ...ready, STRIPE_SECRET_KEY: undefined, STRIPE_PRO_PRICE_ID: undefined, STRIPE_WEBHOOK_SECRET: undefined, LLM_MONTHLY_REQUEST_LIMITS: undefined }),
    ).toEqual([])
  })

  it('warns about missing operator identity, contact address and sign-up provider', () => {
    expect(
      ids({ ...ready, SUPPORT_EMAIL: 'not-an-address', LEGAL_ENTITY_NAME: ' ', GOOGLE_CLIENT_SECRET: undefined }),
    ).toEqual(['no-contact-address', 'no-operator-name', 'no-signup-provider'])
    expect(ids({ ...ready, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' })).toEqual([])
  })

  it('never includes a configured secret value in a finding', () => {
    const text = JSON.stringify(getLaunchReadiness({ ...ready, STRIPE_WEBHOOK_SECRET: '', LLM_MONTHLY_REQUEST_LIMITS: 'sk_test_value' }))
    expect(text).not.toContain('sk_test_value')
    expect(text).not.toContain('google-secret')
  })
})

describe('describePlanAllowance', () => {
  it('describes only allowances that are configured', () => {
    const allowances = { FREE: 50, PRO: 12000, ENTERPRISE: null }
    expect(describePlanAllowance('FREE', allowances)).toBe('50 generations per month.')
    expect(describePlanAllowance('PRO', allowances)).toBe('12,000 generations per month.')
    expect(describePlanAllowance('ENTERPRISE', allowances)).toBe('Unlimited generations per month.')
    expect(describePlanAllowance('PRO', null)).toBeNull()
    expect(describePlanAllowance('PRO', undefined)).toBeNull()
  })
})
