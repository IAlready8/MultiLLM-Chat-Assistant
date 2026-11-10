import type { MetadataRoute } from 'next'
import { PUBLIC_PAGE_PATHS } from '@/lib/public-routes'
import { getSiteUrl } from '@/lib/site-metadata'

// Everything except sign-in and the public pages is a private, per-account
// workspace. Keep crawlers out of it and out of the API.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/auth/signin', '/auth/register', ...PUBLIC_PAGE_PATHS],
        disallow: ['/'],
      },
    ],
    ...(siteUrl ? { sitemap: new URL('/sitemap.xml', siteUrl).toString() } : {}),
  }
}
