import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  limit: vi.fn(),
  quota: vi.fn(),
  user: vi.fn(),
  personas: vi.fn(),
  goals: vi.fn(),
  providers: vi.fn(),
  subscription: vi.fn(),
  conversations: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('@/lib/llm-quota', () => ({ getLlmQuota: mocks.quota }))
vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mocks.user },
    persona: { findMany: mocks.personas },
    goal: { findMany: mocks.goals },
    providerConfig: { findMany: mocks.providers },
    subscription: { findUnique: mocks.subscription },
    conversation: { count: mocks.conversations },
  },
}))

import { GET } from '@/app/api/account/data/route'
import { AccountDataDownload } from '@/components/account-data-download'

const created = new Date('2026-10-01T10:00:00Z')
const ENCRYPTED_KEY = 'v2:ciphertext-that-must-never-leave'

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } })
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.quota.mockResolvedValue({ tier: 'FREE', limit: 50, used: 7, resetsAt: '2026-12-01T00:00:00.000Z' })
  mocks.user.mockResolvedValue({ id: 'owner', name: 'Owner', email: 'owner@example.test', image: null, emailVerified: created })
  mocks.personas.mockResolvedValue([{ id: 'p1', title: 'Editor', description: null, prompt: 'Be concise', createdAt: created, updatedAt: created }])
  mocks.goals.mockResolvedValue([{ id: 'g1', title: 'Launch', description: 'Ship it', status: 'pending', createdAt: created, updatedAt: created }])
  mocks.providers.mockResolvedValue([
    { provider: 'openai', isActive: true, apiKey: ENCRYPTED_KEY, createdAt: created, updatedAt: created },
    { provider: 'ollama', isActive: false, apiKey: null, createdAt: created, updatedAt: created },
  ])
  mocks.subscription.mockResolvedValue({ tier: 'PRO', stripeStatus: 'active', stripeCurrentPeriodEnd: new Date('2026-12-05T00:00:00Z'), stripeCancelAtPeriodEnd: false })
  mocks.conversations.mockResolvedValue(12)
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/account/data', () => {
  it('requires a session', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect(mocks.user).not.toHaveBeenCalled()
  })

  it('returns the caller\'s own data as a downloadable JSON file', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="account-data-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json()
    expect(body).toMatchObject({
      format: 'account-data',
      version: 1,
      profile: { id: 'owner', name: 'Owner', email: 'owner@example.test', emailVerifiedAt: '2026-10-01T10:00:00.000Z' },
      plan: { tier: 'PRO', status: 'active', currentPeriodEndsAt: '2026-12-05T00:00:00.000Z', cancelsAtPeriodEnd: false },
      usage: { monthlyLimit: 50, usedThisMonth: 7 },
      personas: [{ id: 'p1', title: 'Editor', prompt: 'Be concise' }],
      goals: [{ id: 'g1', title: 'Launch', status: 'pending' }],
      connectedProviders: [
        { provider: 'openai', isActive: true, hasSavedApiKey: true },
        { provider: 'ollama', isActive: false, hasSavedApiKey: false },
      ],
      conversations: { count: 12 },
    })
  })

  it('scopes every query to the authenticated user', async () => {
    await GET()
    expect(mocks.user.mock.calls[0][0].where).toEqual({ id: 'owner' })
    for (const query of [mocks.personas, mocks.goals, mocks.providers]) {
      expect(query.mock.calls[0][0].where).toEqual({ userId: 'owner' })
      expect(query.mock.calls[0][0].take).toBe(5000)
    }
    expect(mocks.subscription.mock.calls[0][0].where).toEqual({ userId: 'owner' })
    expect(mocks.conversations).toHaveBeenCalledWith({ where: { userId: 'owner' } })
    expect(mocks.quota).toHaveBeenCalledWith('owner')
  })

  it('never includes key material, password hashes, settings blobs or Stripe identifiers', async () => {
    mocks.user.mockResolvedValue({ id: 'owner', name: 'Owner', email: 'owner@example.test', image: null, emailVerified: null, password: 'bcrypt-hash-value', passwordVersion: 3 })
    mocks.subscription.mockResolvedValue({ tier: 'PRO', stripeStatus: 'active', stripeCurrentPeriodEnd: null, stripeCancelAtPeriodEnd: false, stripeCustomerId: 'cus_secret', stripeSubscriptionId: 'sub_secret' })
    mocks.providers.mockResolvedValue([{ provider: 'openai', isActive: true, apiKey: ENCRYPTED_KEY, settings: '{"headers":{"x-token":"settings-secret"}}', createdAt: created, updatedAt: created }])
    const text = await (await GET()).text()
    for (const secret of [ENCRYPTED_KEY, 'bcrypt-hash-value', 'settings-secret', 'cus_secret', 'sub_secret', 'apiKey', 'passwordVersion']) {
      expect(text).not.toContain(secret)
    }
    expect(mocks.user.mock.calls[0][0].select).not.toHaveProperty('password')
    expect(mocks.providers.mock.calls[0][0].select).not.toHaveProperty('settings')
  })

  it('still exports when usage cannot be read', async () => {
    mocks.quota.mockRejectedValue(new Error('limits invalid'))
    const response = await GET()
    expect(response.status).toBe(200)
    expect((await response.json()).usage).toBeNull()
  })

  it('reports a free plan for an account with no subscription row', async () => {
    mocks.subscription.mockResolvedValue(null)
    expect((await (await GET()).json()).plan).toEqual({ tier: 'FREE', status: null, currentPeriodEndsAt: null, cancelsAtPeriodEnd: false })
  })

  it('is rate limited per account and fails closed', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterMs: 1000 })
    expect((await GET()).status).toBe(429)
    expect(mocks.limit).toHaveBeenCalledWith('account-data-export:owner', { max: 10, windowMs: 900_000 })
    expect(mocks.user).not.toHaveBeenCalled()
    mocks.limit.mockRejectedValue(new Error('limiter down'))
    expect((await GET()).status).toBe(503)
  })

  it('treats a removed account as unauthorized and hides storage errors', async () => {
    mocks.user.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    mocks.user.mockRejectedValue(new Error('private database detail'))
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database detail')
  })
})

describe('AccountDataDownload', () => {
  it('downloads the file and confirms', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"format":"account-data"}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const createObjectURL = vi.fn().mockReturnValue('blob:account-data')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(<AccountDataDownload />)
    await user.click(screen.getByRole('button', { name: 'Download account data' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Account data downloaded.')
    expect(fetch).toHaveBeenCalledWith('/api/account/data', { cache: 'no-store' })
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:account-data')
    click.mockRestore()
  })

  it('shows the server error and does not claim success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 })))
    const user = userEvent.setup()
    render(<AccountDataDownload />)
    await user.click(screen.getByRole('button', { name: 'Download account data' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
