import { afterEach, describe, expect, it } from 'vitest'
import {
  getAuthRoleConfiguration,
  normalizePersistedRole,
  resolveAuthTeamRole,
} from '@/lib/auth-roles'

const originalOwnerEmails = process.env.AUTH_OWNER_EMAILS
const originalAdminEmails = process.env.AUTH_ADMIN_EMAILS

const setEnvVar = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  setEnvVar('AUTH_OWNER_EMAILS', originalOwnerEmails)
  setEnvVar('AUTH_ADMIN_EMAILS', originalAdminEmails)
})

describe('auth role allowlists', () => {
  it('assigns MEMBER when an email is not allowlisted', () => {
    setEnvVar('AUTH_OWNER_EMAILS', 'owner@example.com')
    setEnvVar('AUTH_ADMIN_EMAILS', 'admin@example.com')

    expect(resolveAuthTeamRole('member@example.com')).toBe('MEMBER')
    expect(resolveAuthTeamRole(null)).toBe('MEMBER')
  })

  it('matches owner and admin emails case-insensitively', () => {
    setEnvVar('AUTH_OWNER_EMAILS', ' Owner@Example.com ')
    setEnvVar('AUTH_ADMIN_EMAILS', ' Admin@Example.com ')

    expect(resolveAuthTeamRole('owner@example.com')).toBe('OWNER')
    expect(resolveAuthTeamRole('ADMIN@example.COM')).toBe('ADMIN')
  })

  it('gives owner precedence when an email appears in both lists', () => {
    setEnvVar('AUTH_OWNER_EMAILS', 'operator@example.com')
    setEnvVar('AUTH_ADMIN_EMAILS', 'operator@example.com')

    expect(resolveAuthTeamRole('operator@example.com')).toBe('OWNER')
  })

  it('reports only syntactically email-like allowlist entries', () => {
    setEnvVar(
      'AUTH_OWNER_EMAILS',
      'one@example.com, invalid, TWO@example.com, one@example.com',
    )
    setEnvVar('AUTH_ADMIN_EMAILS', 'admin@example.com,')

    expect(getAuthRoleConfiguration()).toEqual({
      ownerCount: 2,
      adminCount: 1,
    })
  })
})

describe('persisted role combined with allowlists', () => {
  it('elevates a non-allowlisted email to its persisted role', () => {
    setEnvVar('AUTH_OWNER_EMAILS', '')
    setEnvVar('AUTH_ADMIN_EMAILS', '')

    expect(resolveAuthTeamRole('member@example.com', 'ADMIN')).toBe('ADMIN')
    expect(resolveAuthTeamRole('member@example.com', 'OWNER')).toBe('OWNER')
    expect(resolveAuthTeamRole(null, 'ADMIN')).toBe('ADMIN')
  })

  it('never lets a persisted role demote an allowlisted email (P2 floor)', () => {
    setEnvVar('AUTH_OWNER_EMAILS', 'owner@example.com')
    setEnvVar('AUTH_ADMIN_EMAILS', 'admin@example.com')

    expect(resolveAuthTeamRole('owner@example.com', 'MEMBER')).toBe('OWNER')
    expect(resolveAuthTeamRole('owner@example.com', 'ADMIN')).toBe('OWNER')
    expect(resolveAuthTeamRole('admin@example.com', 'MEMBER')).toBe('ADMIN')
  })

  it('takes the more privileged of the two sources', () => {
    setEnvVar('AUTH_OWNER_EMAILS', '')
    setEnvVar('AUTH_ADMIN_EMAILS', 'admin@example.com')

    expect(resolveAuthTeamRole('admin@example.com', 'OWNER')).toBe('OWNER')
  })

  it('keeps allowlist-only behavior when no persisted role is supplied', () => {
    setEnvVar('AUTH_OWNER_EMAILS', '')
    setEnvVar('AUTH_ADMIN_EMAILS', 'admin@example.com')

    expect(resolveAuthTeamRole('admin@example.com', undefined)).toBe('ADMIN')
    expect(resolveAuthTeamRole('member@example.com', null)).toBe('MEMBER')
  })

  it('ignores malformed persisted role values, including USER (P1)', () => {
    setEnvVar('AUTH_OWNER_EMAILS', '')
    setEnvVar('AUTH_ADMIN_EMAILS', '')

    for (const bad of ['', '   ', 'USER', 'user', 'SUPERUSER', 'root', 42, true, {}, []]) {
      expect(resolveAuthTeamRole('member@example.com', bad)).toBe('MEMBER')
    }
  })

  it('grants nothing for non-exact spellings of a valid role (P1 exact match)', () => {
    setEnvVar('AUTH_OWNER_EMAILS', '')
    setEnvVar('AUTH_ADMIN_EMAILS', '')

    for (const nearMiss of [' admin ', 'admin', 'Admin', 'ADMIN ', ' ADMIN', 'owner', 'Owner', ' OWNER', 'OWNER\n', '\tADMIN']) {
      expect(resolveAuthTeamRole('member@example.com', nearMiss)).toBe('MEMBER')
    }
  })

  it('does not let a non-exact spelling raise an allowlisted admin to owner', () => {
    setEnvVar('AUTH_OWNER_EMAILS', '')
    setEnvVar('AUTH_ADMIN_EMAILS', 'admin@example.com')

    expect(resolveAuthTeamRole('admin@example.com', 'owner')).toBe('ADMIN')
    expect(resolveAuthTeamRole('admin@example.com', ' OWNER ')).toBe('ADMIN')
    expect(resolveAuthTeamRole('admin@example.com', 'OWNER')).toBe('OWNER')
  })

  // P2 preservation: with the post-migration default (MEMBER) or no stored
  // value, the result equals the allowlist-only result for every placement.
  it('matches allowlist-only behavior for every placement when the stored role is the default', () => {
    const placements: Array<{ owner: string; admin: string }> = [
      { owner: '', admin: '' },
      { owner: 'a@example.com', admin: '' },
      { owner: '', admin: 'a@example.com' },
      { owner: 'a@example.com', admin: 'a@example.com' },
      { owner: 'b@example.com', admin: 'c@example.com' },
    ]
    for (const { owner, admin } of placements) {
      setEnvVar('AUTH_OWNER_EMAILS', owner)
      setEnvVar('AUTH_ADMIN_EMAILS', admin)
      for (const email of ['a@example.com', 'A@Example.com ', null, '']) {
        const allowlistOnly = resolveAuthTeamRole(email)
        expect(resolveAuthTeamRole(email, 'MEMBER')).toBe(allowlistOnly)
        expect(resolveAuthTeamRole(email, null)).toBe(allowlistOnly)
        expect(resolveAuthTeamRole(email, undefined)).toBe(allowlistOnly)
      }
    }
  })
})

describe('normalizePersistedRole', () => {
  it('accepts exactly OWNER, ADMIN and MEMBER', () => {
    expect(normalizePersistedRole('OWNER')).toBe('OWNER')
    expect(normalizePersistedRole('ADMIN')).toBe('ADMIN')
    expect(normalizePersistedRole('MEMBER')).toBe('MEMBER')
  })

  it('rejects surrounding whitespace and any other casing', () => {
    expect(normalizePersistedRole(' admin ')).toBeNull()
    expect(normalizePersistedRole('Member')).toBeNull()
    expect(normalizePersistedRole('owner')).toBeNull()
    expect(normalizePersistedRole('ADMIN ')).toBeNull()
    expect(normalizePersistedRole(' OWNER')).toBeNull()
    expect(normalizePersistedRole('MEMBER\n')).toBeNull()
  })

  it('returns null for anything else', () => {
    expect(normalizePersistedRole(undefined)).toBeNull()
    expect(normalizePersistedRole(null)).toBeNull()
    expect(normalizePersistedRole('')).toBeNull()
    expect(normalizePersistedRole('USER')).toBeNull()
    expect(normalizePersistedRole('GUEST')).toBeNull()
    expect(normalizePersistedRole(1)).toBeNull()
    expect(normalizePersistedRole({ toString: () => 'ADMIN' })).toBeNull()
  })
})
