import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), identity: vi.fn(), user: vi.fn(), accounts: vi.fn(), intent: vi.fn(), limit: vi.fn(), password: vi.fn(), request: vi.fn(), process: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/auth', () => ({ authIdentity: mocks.identity }))
vi.mock('@/lib/prisma', () => ({ default: { user: { findUnique: mocks.user }, account: { findMany: mocks.accounts }, accountDeletion: { findUnique: mocks.intent } } }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('bcryptjs', () => ({ compare: mocks.password }))
vi.mock('@/services/account-deletion-service', () => {
  class AccountDeletionError extends Error { constructor(readonly code: string, readonly status = 503) { super(code) } }
  return { AccountDeletionError, requestAccountDeletion: mocks.request, processAccountDeletion: mocks.process, deletionProgress: (value: unknown) => value }
})
import { GET, POST } from '@/app/api/account/deletion/route'
const post = (body: unknown = { userId: 'user-1', confirmation: 'DELETE MY ACCOUNT' }) => POST(new Request('http://localhost/api/account/deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'user-1', email: 'unit@test.invalid' } })
  mocks.identity.mockResolvedValue({ user: { id: 'user-1', authProvider: 'google', authenticatedAt: Date.now() } })
  mocks.user.mockResolvedValue({ password: null })
  mocks.accounts.mockResolvedValue([{ provider: 'google' }])
  mocks.intent.mockResolvedValue(null)
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.process.mockResolvedValue({ status: 'complete' })
})
describe('self-service account deletion', () => {
  it('rejects signed-out requests', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect((await post()).status).toBe(401)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('lets an OAuth-only account use a fresh sign-in without a password', async () => {
    const response = await post()
    expect(response.status).toBe(200)
    expect(mocks.request).toHaveBeenCalledWith('user-1')
    expect(mocks.password).not.toHaveBeenCalled()
  })
  it('rejects an old OAuth login and an unlinked provider', async () => {
    mocks.identity.mockResolvedValue({ user: { id: 'user-1', authProvider: 'google', authenticatedAt: Date.now() - 301_000 } })
    expect((await post()).status).toBe(403)
    mocks.accounts.mockResolvedValue([{ provider: 'github' }])
    mocks.identity.mockResolvedValue({ user: { id: 'user-1', authProvider: 'google', authenticatedAt: Date.now() } })
    expect((await post()).status).toBe(403)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('binds confirmation to the original account across an OAuth account switch', async () => {
    expect((await post({ userId: 'other-user', confirmation: 'DELETE MY ACCOUNT' })).status).toBe(409)
    expect(mocks.request).not.toHaveBeenCalled()
    expect((await post({ userId: 'user-1', confirmation: 'delete' })).status).toBe(400)
  })
  it('requires the actual current password for credentials accounts', async () => {
    mocks.identity.mockResolvedValue({ user: { id: 'user-1', authProvider: 'credentials', authenticatedAt: Date.now() } })
    mocks.user.mockResolvedValue({ password: 'bcrypt-hash' })
    mocks.password.mockResolvedValue(false)
    expect((await post({ userId: 'user-1', confirmation: 'DELETE MY ACCOUNT', password: 'wrong' })).status).toBe(403)
    mocks.password.mockResolvedValue(true)
    expect((await post({ userId: 'user-1', confirmation: 'DELETE MY ACCOUNT', password: 'correct' })).status).toBe(200)
    expect(mocks.password).toHaveBeenCalledWith('correct', 'bcrypt-hash')
  })
  it('allows a pending request to retry after the original reauthentication expires', async () => {
    mocks.intent.mockResolvedValue({ status: 'requested' })
    mocks.identity.mockResolvedValue(null)
    mocks.process.mockResolvedValue({ status: 'requested' })
    expect((await post()).status).toBe(202)
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.process).toHaveBeenCalledWith('user-1')
  })
  it('returns only public recovery fields, with no password or provider credentials', async () => {
    mocks.user.mockResolvedValue({ password: 'bcrypt-hash', apiKey: 'must-not-escape' })
    const response = await GET()
    const text = await response.text()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(text).not.toContain('bcrypt-hash')
    expect(text).not.toContain('must-not-escape')
    expect(JSON.parse(text)).toMatchObject({ hasPassword: true, providers: ['google'], recentOAuth: true })
  })
  it('enforces distributed throttling before identity verification or billing work', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterMs: 900_000 })
    const response = await post()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('900')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('bounds the body and rejects additional fields', async () => {
    expect((await post({ userId: 'user-1', confirmation: 'DELETE MY ACCOUNT', user: 'other' })).status).toBe(400)
    expect((await post({ data: 'x'.repeat(5000) })).status).toBe(413)
    expect(mocks.process).not.toHaveBeenCalled()
  })
})
