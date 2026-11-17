import { StripeConfigurationError } from '@/lib/stripe'

/** Validate before creating customers, sessions or any other Stripe resource. */
export function getBillingOrigin(): URL {
  const configured = process.env.NEXTAUTH_URL?.trim()
  if (!configured && process.env.NODE_ENV !== 'production') return new URL('http://localhost:3000')
  try {
    const url = new URL(configured ?? '')
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((process.env.NODE_ENV === 'production' && local) || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production'))) {
      throw new Error('Invalid billing origin')
    }
    return new URL(url.origin)
  } catch {
    throw new StripeConfigurationError('A valid NEXTAUTH_URL origin is required for billing.')
  }
}
