import type { Metadata } from 'next'
import { getAppName } from '@/lib/app-name'

const DESCRIPTION =
  'Run one brief across multiple AI providers, compare the answers side by side, and keep the history.'

/** The canonical public origin of this deployment, or null when not configured. */
export const getSiteUrl = (
  env: Record<string, string | undefined> = process.env,
): URL | null => {
  for (const candidate of [env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL]) {
    const value = candidate?.trim()
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return new URL(url.origin)
      }
    } catch {
      // Ignore a malformed value and try the next source.
    }
  }
  return null
}

export const buildSiteMetadata = (
  env: Record<string, string | undefined> = process.env,
): Metadata => {
  const name = getAppName(env.NEXT_PUBLIC_APP_NAME ?? '')
  const siteUrl = getSiteUrl(env)

  return {
    ...(siteUrl ? { metadataBase: siteUrl } : {}),
    title: { default: name, template: `%s | ${name}` },
    description: DESCRIPTION,
    applicationName: name,
    openGraph: {
      type: 'website',
      siteName: name,
      title: name,
      description: DESCRIPTION,
    },
    twitter: { card: 'summary', title: name, description: DESCRIPTION },
    // The workspace is private; only the pages robots.txt allows are indexable.
    robots: { index: true, follow: true },
  }
}
