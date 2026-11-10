import type { MetadataRoute } from 'next'

// Everything except the sign-in and legal pages is a private, per-account
// workspace. Keep crawlers out of it and out of the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/auth/signin', '/auth/register', '/terms', '/privacy'],
        disallow: ['/'],
      },
    ],
  }
}
