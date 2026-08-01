export type AuthTeamRole = 'OWNER' | 'ADMIN' | 'MEMBER'

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

export const resolveAuthTeamRole = (
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

export const getAuthRoleConfiguration = () => ({
  ownerCount: parseEmailAllowlist(process.env.AUTH_OWNER_EMAILS).size,
  adminCount: parseEmailAllowlist(process.env.AUTH_ADMIN_EMAILS).size,
})
