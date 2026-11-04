const OAUTH_PROVIDERS = new Set(['google', 'github'])
export const DELETION_PROOF_MAX_AGE_MS = 5 * 60_000

export function hasRecentOAuthProof(
  identity: { authenticatedAt?: number; authProvider?: string },
  linkedProviders: string[],
  now = Date.now(),
): boolean {
  const { authenticatedAt, authProvider } = identity
  return typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt)
    && typeof authProvider === 'string' && OAUTH_PROVIDERS.has(authProvider)
    && linkedProviders.includes(authProvider)
    && authenticatedAt <= now + 5_000
    && now - authenticatedAt <= DELETION_PROOF_MAX_AGE_MS
}
