import type { MetadataRoute } from 'next'
import { PUBLIC_PAGE_PATHS } from '@/lib/public-routes'
import { getSiteUrl } from '@/lib/site-metadata'

// Only pages a signed-out visitor can read. Listed only when the public origin
// is configured, so a preview deployment never advertises the wrong host.
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl()
  if (!siteUrl) return []
  return PUBLIC_PAGE_PATHS.map((path) => ({
    url: new URL(path, siteUrl).toString(),
    changeFrequency: 'monthly' as const,
    priority: path === '/pricing' ? 1 : 0.5,
  }))
}
