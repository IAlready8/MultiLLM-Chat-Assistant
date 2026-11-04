export const PUBLIC_PAGE_PATHS = new Set(['/', '/pricing', '/terms', '/privacy', '/support'])
export const isPublicPagePath = (pathname: string) => PUBLIC_PAGE_PATHS.has(pathname)
