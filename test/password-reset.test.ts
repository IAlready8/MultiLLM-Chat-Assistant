// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'

type TokenRow = { identifier: string; token: string; expires: Date }
type UserRow = { id: string; email: string; password: string | null; passwordVersion: number; deletionRequestedAt: Date | null }

const store = vi.hoisted(() => ({ tokens: [] as TokenRow[], users: [] as UserRow[] }))

const db = vi.hoisted(() => {
  const matchToken = (row: TokenRow, where: Record<string, any>) =>
    (where.token === undefined || row.token === where.token) &&
    (where.identifier === undefined || row.identifier === where.identifier) &&
    (where.expires?.gt === undefined || row.expires > where.expires.gt)
  const client: any = {
    verificationToken: {
      findUnique: async ({ where }: any) => store.tokens.find(row => row.token === where.token) ?? null,
      deleteMany: async ({ where }: any) => {
        const before = store.tokens.length
        store.tokens = store.tokens.filter(row => !matchToken(row, where))
        return { count: before - store.tokens.length }
      },
      create: async ({ data }: any) => { store.tokens.push({ ...data }); return data },
    },
    user: {
      findUnique: async ({ where }: any) => store.users.find(user => user.email === where.email) ?? null,
      updateMany: async ({ where, data }: any) => {
        const user = store.users.find(row => row.id === where.id && row.password !== null && row.deletionRequestedAt === null)
        if (!user) return { count: 0 }
        user.password = data.password
        user.passwordVersion += data.passwordVersion.increment
        return { count: 1 }
      },
    },
    $transaction: async (work: any) => Array.isArray(work) ? Promise.all(work) : work(client),
  }
  return client
})

vi.mock('@/lib/prisma', () => ({ default: db }))

import {
  consumePasswordResetToken, hashPasswordResetToken, PASSWORD_RESET_TTL_MS, PasswordResetError,
} from '@/lib/password-reset'
import { issuePasswordReset, normaliseOrigin, hashPasswordResetToken as scriptHash } from '../scripts/issue-password-reset.mjs'

const ORIGIN = 'https://app.example'
const tokenFrom = (url: string | undefined) => new URL(url ?? '').hash.replace('#token=', '')

beforeEach(() => {
  store.tokens = []
  store.users = [
    { id: 'pw-user', email: 'pw@example.com', password: '$2b$10$existinghashexistinghashexistinghashexistinghash12', passwordVersion: 3, deletionRequestedAt: null },
    { id: 'oauth-user', email: 'oauth@example.com', password: null, passwordVersion: 0, deletionRequestedAt: null },
    { id: 'leaving-user', email: 'leaving@example.com', password: '$2b$10$x', passwordVersion: 0, deletionRequestedAt: new Date() },
  ]
})

describe('support-issued password reset', () => {
  it('stores only a hash of a 256-bit token and hashes identically in the script and the app', async () => {
    const issued = await issuePasswordReset(db, { email: 'PW@example.com', origin: ORIGIN })
    expect(issued.ok).toBe(true)
    const token = tokenFrom(issued.url)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new URL(issued.url ?? '').pathname).toBe('/auth/reset-password')
    expect(new URL(issued.url ?? '').search).toBe('')
    expect(store.tokens).toHaveLength(1)
    expect(store.tokens[0].token).toBe(hashPasswordResetToken(token))
    expect(store.tokens[0].token).toBe(scriptHash(token))
    expect(store.tokens[0].token).not.toContain(token)
    expect(store.tokens[0].identifier).toBe('password-reset:pw-user')
  })

  it('resets the password once, revokes earlier sessions and removes the token', async () => {
    const issued = await issuePasswordReset(db, { email: 'pw@example.com', origin: ORIGIN })
    await consumePasswordResetToken(tokenFrom(issued.url), 'a fresh password 1')
    const user = store.users[0]
    expect(user.passwordVersion).toBe(4)
    expect(await bcrypt.compare('a fresh password 1', user.password!)).toBe(true)
    expect(store.tokens).toHaveLength(0)
    await expect(consumePasswordResetToken(tokenFrom(issued.url), 'another password 2')).rejects.toMatchObject({ kind: 'invalid' })
    expect(user.passwordVersion).toBe(4)
  })

  it('lets only one of two concurrent uses succeed', async () => {
    const issued = await issuePasswordReset(db, { email: 'pw@example.com', origin: ORIGIN })
    const token = tokenFrom(issued.url)
    const results = await Promise.allSettled([
      consumePasswordResetToken(token, 'first password 1'),
      consumePasswordResetToken(token, 'second password 2'),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(store.users[0].passwordVersion).toBe(4)
  })

  it('rejects an expired token with the same message as an unknown one', async () => {
    const issuedAt = new Date('2026-11-24T10:00:00Z')
    const issued = await issuePasswordReset(db, { email: 'pw@example.com', origin: ORIGIN, now: issuedAt })
    const expired = consumePasswordResetToken(tokenFrom(issued.url), 'a fresh password 1', new Date(issuedAt.getTime() + PASSWORD_RESET_TTL_MS))
    const unknown = consumePasswordResetToken('A'.repeat(43), 'a fresh password 1')
    const errors = await Promise.allSettled([expired, unknown])
    const messages = errors.map(result => result.status === 'rejected' ? (result.reason as PasswordResetError).message : 'ok')
    expect(messages[0]).toBe(messages[1])
    expect(messages[0]).toMatch(/invalid or has expired/)
    expect(store.users[0].passwordVersion).toBe(3)
  })

  it('replaces an earlier outstanding link when a new one is issued', async () => {
    const first = await issuePasswordReset(db, { email: 'pw@example.com', origin: ORIGIN })
    const second = await issuePasswordReset(db, { email: 'pw@example.com', origin: ORIGIN })
    expect(store.tokens).toHaveLength(1)
    await expect(consumePasswordResetToken(tokenFrom(first.url), 'a fresh password 1')).rejects.toMatchObject({ kind: 'invalid' })
    await consumePasswordResetToken(tokenFrom(second.url), 'a fresh password 1')
  })

  it('rejects malformed tokens and weak passwords before touching the database', async () => {
    const spy = vi.spyOn(db.verificationToken, 'findUnique')
    await expect(consumePasswordResetToken('short', 'a fresh password 1')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(consumePasswordResetToken(undefined, 'a fresh password 1')).rejects.toMatchObject({ kind: 'invalid' })
    await expect(consumePasswordResetToken('A'.repeat(43), 'short')).rejects.toMatchObject({ kind: 'weak-password' })
    await expect(consumePasswordResetToken('A'.repeat(43), 'x'.repeat(73))).rejects.toMatchObject({ kind: 'weak-password' })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('refuses to issue links for accounts without a password or with deletion pending', async () => {
    await expect(issuePasswordReset(db, { email: 'oauth@example.com', origin: ORIGIN })).resolves.toEqual({ ok: false, reason: 'not-a-password-account' })
    await expect(issuePasswordReset(db, { email: 'leaving@example.com', origin: ORIGIN })).resolves.toEqual({ ok: false, reason: 'deletion-pending' })
    await expect(issuePasswordReset(db, { email: 'nobody@example.com', origin: ORIGIN })).resolves.toEqual({ ok: false, reason: 'no-account' })
    expect(store.tokens).toHaveLength(0)
  })

  it('does not reset an account whose deletion started after the link was issued', async () => {
    const issued = await issuePasswordReset(db, { email: 'pw@example.com', origin: ORIGIN })
    store.users[0].deletionRequestedAt = new Date()
    await expect(consumePasswordResetToken(tokenFrom(issued.url), 'a fresh password 1')).rejects.toMatchObject({ kind: 'invalid' })
    expect(store.users[0].passwordVersion).toBe(3)
  })

  it('only builds links for https origins without a path', () => {
    expect(normaliseOrigin('https://app.example')).toBe('https://app.example')
    expect(normaliseOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    expect(() => normaliseOrigin('http://app.example')).toThrow(/https/)
    expect(() => normaliseOrigin('https://app.example/path')).toThrow(/path/)
    expect(() => normaliseOrigin('not a url')).toThrow(/absolute/)
  })
})
