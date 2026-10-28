import NextAuth, { DefaultSession, NextAuthOptions } from 'next-auth'
import { decode } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { cookies } from 'next/headers'
import { authorizeCredentials } from '@/lib/credentials-auth'
import { resolveAuthTeamRole } from '@/lib/auth-roles'
import { hasDatabaseUrl } from '@/lib/database-url'
import prisma from '@/lib/prisma'
import { readSessionTokenFromCookies } from '@/lib/session-cookie'
import { validateStartupEnvironment } from '@/lib/startup-validation'
import { sanitizeLogValue } from '@/lib/log-sanitizer'
import { authLogger } from '@/lib/auth-logger'

type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE'
type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: TeamRole
      tier: SubscriptionTier
    } & DefaultSession['user']
  }

  interface JWT {
    id?: string
    role?: TeamRole
    tier?: SubscriptionTier
    pv?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: TeamRole
    tier?: SubscriptionTier
    pv?: number
  }
}

validateStartupEnvironment()

const resolveAuthSecret = (): string => {
  const configuredSecret =
    process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET

  if (configuredSecret?.trim()) {
    return configuredSecret.trim()
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test-only-nextauth-secret-not-for-runtime-use'
  }

  throw new Error(
    'NEXTAUTH_SECRET (or AUTH_SECRET) is required. Configure a stable secret before starting the application.',
  )
}

const authSecret = resolveAuthSecret()

const loadSubscriptionTier = async (
  userId: string,
): Promise<SubscriptionTier> => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { tier: true },
    })
    return (subscription?.tier as SubscriptionTier) || 'FREE'
  } catch (error) {
    console.warn('Failed to load subscription tier, defaulting to FREE:', sanitizeLogValue(error))
    return 'FREE'
  }
}

const buildProviders = (): NextAuthOptions['providers'] => {
  const providers: NextAuthOptions['providers'] = []
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  const githubClientId = process.env.GITHUB_CLIENT_ID?.trim()
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim()

  if (googleClientId && googleClientSecret) {
    providers.push(
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }),
    )
  }

  if (githubClientId && githubClientSecret) {
    providers.push(
      GitHubProvider({
        clientId: githubClientId,
        clientSecret: githubClientSecret,
      }),
    )
  }

  providers.push(
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  )

  return providers
}

const maybeAdapter = hasDatabaseUrl() ? PrismaAdapter(prisma as any) : undefined

export const authOptions: NextAuthOptions = {
  adapter: maybeAdapter,
  logger: authLogger,
  providers: buildProviders(),
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ account }) {
      console.info(`[auth] sign-in method=${account?.provider ?? 'unknown'}`)
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        try {
          const record = await prisma.user.findUnique({
            where: { id: user.id },
            select: { passwordVersion: true },
          })
          token.pv = record?.passwordVersion ?? 0
        } catch {
          token.pv = token.pv ?? 0
        }
      }

      const userId = (user?.id || token.id || token.sub) as string | undefined
      if (userId) {
        token.tier = await loadSubscriptionTier(userId)
      }

      token.role = resolveAuthTeamRole(user?.email ?? token.email)
      token.tier = token.tier || 'FREE'
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = token.id || token.sub
        if (userId) {
          session.user.id = userId
        }
        session.user.role = token.role || 'MEMBER'
        session.user.tier = token.tier || 'FREE'
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  secret: authSecret,
}

export const readSessionTokenFromCookieStore = (
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) => readSessionTokenFromCookies(cookieStore.getAll())

/**
 * Decode the session cookie into the caller's identity without any database
 * access. Protected API routes use this through `getAuthenticatedUser`, which
 * re-reads the account itself and never consumes the subscription tier, so
 * loading the tier there would cost a database round-trip per request for a
 * value that is discarded.
 */
export async function authIdentity() {
  const cookieStore = await cookies()
  const sessionToken = readSessionTokenFromCookieStore(cookieStore)
  if (!sessionToken) {
    return null
  }

  const token = await decode({
    token: sessionToken,
    secret: authSecret,
  })

  if (!token) {
    return null
  }

  const userId = (token.id || token.sub) as string | undefined
  if (!token.exp || !userId) {
    return null
  }

  return {
    expires: new Date(Number(token.exp) * 1000).toISOString(),
    user: {
      id: userId,
      name: token.name,
      email: token.email,
      role: (token.role || 'MEMBER') as TeamRole,
      pv: typeof token.pv === 'number' ? token.pv : 0,
    },
  }
}

/** Session for pages that render plan state; refreshes the tier from the database. */
export async function auth() {
  const identity = await authIdentity()
  if (!identity) {
    return null
  }

  const tier = await loadSubscriptionTier(identity.user.id)

  return {
    expires: identity.expires,
    user: {
      ...identity.user,
      tier,
    },
  }
}

const handler = NextAuth(authOptions)
export default handler
