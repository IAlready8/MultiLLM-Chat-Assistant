import { getLegalDetails } from '@/lib/legal'
import { getSiteUrl } from '@/lib/site-metadata'

// RFC 9116 vulnerability disclosure contact. Served only when a contact
// address is configured: a security.txt with no working contact is worse than
// none, because researchers treat it as authoritative.
export const dynamic = 'force-dynamic'

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

export async function GET() {
  const { contactEmail } = getLegalDetails()
  if (!contactEmail) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  const siteUrl = getSiteUrl()
  const lines = [
    `Contact: mailto:${contactEmail}`,
    `Expires: ${new Date(Date.now() + ONE_YEAR_MS).toISOString()}`,
    'Preferred-Languages: en',
    ...(siteUrl
      ? [`Canonical: ${new URL('/.well-known/security.txt', siteUrl).toString()}`]
      : []),
  ]

  return new Response(`${lines.join('\n')}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
