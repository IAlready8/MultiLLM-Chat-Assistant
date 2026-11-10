/**
 * Pages that must be readable without a session: what a visitor needs to
 * read before creating an account (the offer, the legal documents, and how to
 * get help).
 *
 * Shared by the request proxy (server) and AuthGuard (client) so the two can
 * never disagree about what is public. Keep this list short and explicit.
 */
export const PUBLIC_PAGE_PATHS = ['/pricing', '/terms', '/privacy', '/support'] as const

export const isPublicPagePath = (pathname: string): boolean =>
  PUBLIC_PAGE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
