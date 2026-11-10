import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUser: vi.fn(),
  limit: vi.fn(),
  compare: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ default: { user: { findUnique: mocks.findUser } } }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare } }))
vi.mock('@/services/account-deletion-service', () => {
  class AccountDeletionError extends Error {
    constructor(public readonly code: string) {
      super(code)
    }
  }
  return { AccountDeletionError, deleteAccount: mocks.deleteAccount }
})

import { DELETE } from '@/app/api/account/route'
import { AccountDeletionError } from '@/services/account-deletion-service'

const request = (body: unknown) =>
  new Request('http://localhost/api/account', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.auth.mockResolvedValue({ user: { id: 'owner', email: 'owner@example.test' } })
  mocks.findUser.mockResolvedValue({ email: 'Owner@Example.test', password: null })
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.deleteAccount.mockResolvedValue({ cancelledSubscriptions: 0 })
})

describe('DELETE /api/account', () => {
  it('requires a session', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }))
    expect((await DELETE(request({ confirmEmail: 'owner@example.test' }))).status).toBe(401)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes only the authenticated account after a case-insensitive email confirmation', async () => {
    const response = await DELETE(request({ confirmEmail: ' OWNER@example.test ' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1)
    expect(mocks.deleteAccount).toHaveBeenCalledWith('owner')
  })

  it.each([
    {},
    { confirmEmail: '' },
    { confirmEmail: 'owner@example.test', userId: 'someone-else' },
    { confirmEmail: 'owner@example.test', id: 'someone-else' },
    { confirmEmail: 42 },
  ])('rejects malformed or over-posted bodies without deleting: %j', async (body) => {
    expect((await DELETE(request(body))).status).toBe(400)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('rejects a confirmation email that does not match the account', async () => {
    const response = await DELETE(request({ confirmEmail: 'other@example.test' }))
    expect(response.status).toBe(400)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('refuses to delete an account that has no email to confirm against', async () => {
    mocks.findUser.mockResolvedValue({ email: null, password: null })
    expect((await DELETE(request({ confirmEmail: 'owner@example.test' }))).status).toBe(400)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('asks password accounts for their password before deleting', async () => {
    mocks.findUser.mockResolvedValue({ email: 'owner@example.test', password: 'stored-hash' })
    const response = await DELETE(request({ confirmEmail: 'owner@example.test' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'PASSWORD_REQUIRED' })
    expect(mocks.compare).not.toHaveBeenCalled()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('rejects a wrong password and never returns the stored hash', async () => {
    mocks.findUser.mockResolvedValue({ email: 'owner@example.test', password: 'stored-hash' })
    mocks.compare.mockResolvedValue(false)
    const response = await DELETE(request({ confirmEmail: 'owner@example.test', password: 'wrong' }))
    expect(response.status).toBe(401)
    expect(await response.text()).not.toContain('stored-hash')
    expect(mocks.compare).toHaveBeenCalledWith('wrong', 'stored-hash')
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('deletes a password account once the password is verified', async () => {
    mocks.findUser.mockResolvedValue({ email: 'owner@example.test', password: 'stored-hash' })
    mocks.compare.mockResolvedValue(true)
    expect((await DELETE(request({ confirmEmail: 'owner@example.test', password: 'right' }))).status).toBe(200)
    expect(mocks.deleteAccount).toHaveBeenCalledWith('owner')
  })

  it('limits repeated attempts before reading the body or the account', async () => {
    mocks.limit.mockResolvedValue({ allowed: false })
    expect((await DELETE(request({ confirmEmail: 'owner@example.test' }))).status).toBe(429)
    expect(mocks.limit).toHaveBeenCalledWith('account-delete:owner', { windowMs: 900_000, max: 5 })
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('fails closed when request protection is unavailable', async () => {
    mocks.limit.mockRejectedValue(new Error('redis down'))
    expect((await DELETE(request({ confirmEmail: 'owner@example.test' }))).status).toBe(503)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('keeps the account when billing cannot be cancelled', async () => {
    mocks.deleteAccount.mockRejectedValue(new AccountDeletionError('BILLING_CANCEL_FAILED'))
    const response = await DELETE(request({ confirmEmail: 'owner@example.test' }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'BILLING_CANCEL_FAILED' })
  })

  it('reports storage failures without leaking internals or claiming success', async () => {
    mocks.deleteAccount.mockRejectedValue(new Error('private database detail'))
    const response = await DELETE(request({ confirmEmail: 'owner@example.test' }))
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).not.toContain('private database detail')
    expect(text).toContain('Nothing was removed')
  })

  it('treats a session for an already removed account as unauthorized', async () => {
    mocks.findUser.mockResolvedValue(null)
    expect((await DELETE(request({ confirmEmail: 'owner@example.test' }))).status).toBe(401)
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })
})
