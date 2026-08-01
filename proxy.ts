import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decode } from 'next-auth/jwt'
import { readSessionTokenFromCookies } from '@/lib/session-cookie'

const PUBLIC_PATHS = new Set([
  '/auth/signin',
  '/auth/register',
  '/auth/signout',
  '/auth/error',
  '/api/auth',
  '/api/health',
  '/api/webhooks',
])

const isPublicPath = (pathname: string): boolean => {
  for (const prefix of PUBLIC_PATHS) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return true
    }
  }
  return false
}

const isStaticAsset = (pathname: string): boolean =>
  pathname.startsWith('/_next/') ||
  pathname.startsWith('/favicon') ||
  pathname.startsWith('/apple-touch-icon') ||
  pathname.endsWith('.png') ||
  pathname.endsWith('.ico') ||
  pathname.endsWith('.svg')

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow static assets and public auth routes
  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const authSecret =
    process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim()

  if (!authSecret) {
    const message =
      'Authentication misconfigured: set NEXTAUTH_SECRET or AUTH_SECRET.'
    console.error(message)

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Server authentication is not configured.' },
        { status: 500 },
      )
    }

    const errorUrl = new URL('/auth/error', request.url)
    errorUrl.searchParams.set('error', 'Configuration')
    return NextResponse.redirect(errorUrl)
  }

  // Every protected route requires a valid JWT session.
  const sessionToken = readSessionTokenFromCookies(request.cookies.getAll())
  let token = null
  if (sessionToken) {
    try {
      token = await decode({
        token: sessionToken,
        secret: authSecret,
      })
    } catch {
      token = null
    }
  }

  if (!token) {
    // API routes return 401; page routes redirect to signin
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const signInUrl = new URL('/auth/signin', request.url)
    signInUrl.searchParams.set(
      'callbackUrl',
      `${pathname}${request.nextUrl.search}`,
    )
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
