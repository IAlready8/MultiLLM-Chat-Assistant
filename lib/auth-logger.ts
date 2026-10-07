import type { NextAuthOptions } from 'next-auth'
import { sanitizeLogString, summarizeErrorForLogs } from '@/lib/log-sanitizer'

// NextAuth debug metadata includes raw state/PKCE values under the generic
// `value` key and complete OAuth profiles. Never emit arbitrary metadata.
export const authLogger: NonNullable<NextAuthOptions['logger']> = {
  error(code, metadata) {
    console.error(
      `[next-auth][error][${sanitizeLogString(code)}]`,
      summarizeErrorForLogs(metadata instanceof Error ? metadata : metadata?.error),
    )
  },
  warn(code) {
    console.warn(`[next-auth][warn][${sanitizeLogString(code)}]`)
  },
  debug(code) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[next-auth][debug][${sanitizeLogString(code)}]`)
    }
  },
}
