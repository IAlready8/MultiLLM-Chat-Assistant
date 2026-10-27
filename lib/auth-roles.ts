export type AuthTeamRole = 'OWNER' | 'ADMIN' | 'MEMBER'

// Role vocabulary policy (P1): OWNER, ADMIN and MEMBER only. There is no
// USER role; any other stored value is ignored and grants nothing.
export const AUTH_TEAM_ROLES: readonly AuthTeamRole[] = ['OWNER', 'ADMIN', 'MEMBER']

// Higher rank means more privilege. Used to combine the environment allowlist
// with the persisted User.role column.
const ROLE_RANK: Record<AuthTeamRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
}

const normalizeEmail = (email: string | null | undefined): string =>
  email?.trim().toLowerCase() ?? ''

const EMAIL_ALLOWLIST_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const parseEmailAllowlist = (value: string | undefined): Set<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map(normalizeEmail)
      .filter((email) => EMAIL_ALLOWLIST_PATTERN.test(email)),
  )

/**
 * Accept only the exact strings 'OWNER', 'ADMIN' and 'MEMBER'. No trimming
 * and no case folding: ' admin ', 'Member', 'owner', USER, empty strings,
 * non-strings and any other value are treated as "no persisted role", so a
 * malformed or foreign database value can never grant privilege.
 */
export const normalizePersistedRole = (role: unknown): AuthTeamRole | null =>
  typeof role === 'string' && (AUTH_TEAM_ROLES as readonly string[]).includes(role)
    ? (role as AuthTeamRole)
    : null

const resolveAllowlistRole = (
  email: string | null | undefined,
): AuthTeamRole => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return 'MEMBER'

  if (parseEmailAllowlist(process.env.AUTH_OWNER_EMAILS).has(normalizedEmail)) {
    return 'OWNER'
  }

  if (parseEmailAllowlist(process.env.AUTH_ADMIN_EMAILS).has(normalizedEmail)) {
    return 'ADMIN'
  }

  return 'MEMBER'
}

/**
 * Effective role (P2): the more privileged of
 *   1. the environment allowlists (AUTH_OWNER_EMAILS, AUTH_ADMIN_EMAILS), and
 *   2. the persisted User.role column, when supplied and valid.
 *
 * The allowlist is a privilege floor: a persisted MEMBER never demotes an
 * allowlisted email. To revoke an allowlist-granted role, remove the email
 * from the environment variable.
 *
 * Every row receives the column default MEMBER when the migration runs, so
 * effective roles are identical to the allowlist-only behavior until an
 * operator stores ADMIN or OWNER for a specific account.
 *
 * Calling with only an email keeps the original allowlist-only behavior, so
 * the JWT callback in lib/auth.ts is unchanged.
 */
export const resolveAuthTeamRole = (
  email: string | null | undefined,
  persistedRole?: unknown,
): AuthTeamRole => {
  const allowlistRole = resolveAllowlistRole(email)
  const storedRole = normalizePersistedRole(persistedRole)
  if (!storedRole) return allowlistRole
  return ROLE_RANK[storedRole] > ROLE_RANK[allowlistRole]
    ? storedRole
    : allowlistRole
}

export const getAuthRoleConfiguration = () => ({
  ownerCount: parseEmailAllowlist(process.env.AUTH_OWNER_EMAILS).size,
  adminCount: parseEmailAllowlist(process.env.AUTH_ADMIN_EMAILS).size,
})
