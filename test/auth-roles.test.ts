import { afterEach, describe, expect, it } from 'vitest'
import {
  getAuthRoleConfiguration,
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
