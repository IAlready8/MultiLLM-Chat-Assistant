/**
 * Pages that must be readable without a session: legal documents that a
 * visitor has to be able to read before creating an account.
 *
 * Shared by the request proxy (server) and AuthGuard (client) so the two can
 * never disagree about what is public. Keep this list short and explicit.
 */
export const PUBLIC_PAGE_PATHS = ['/terms', '/privacy'] as const

export const isPublicPagePath = (pathname: string): boolean =>
  PUBLIC_PAGE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
