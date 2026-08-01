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
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: TeamRole
    tier?: SubscriptionTier
  }
}

validateStartupEnvironment()

const resolveAuthSecret = (): string => {
  const configuredSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET

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

const authLogger: NonNullable<NextAuthOptions['logger']> = {
  error(code, metadata) {
    console.error(`[next-auth][error][${code}]`, metadata ?? '')
  },
  warn(code) {
    console.warn(`[next-auth][warn][${code}]`)
  },
  debug(code, metadata) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[next-auth][debug][${code}]`, metadata ?? '')
    }
  },
}

const buildProviders = (): NextAuthOptions['providers'] => {
  const providers: NextAuthOptions['providers'] = []

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    )
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
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
          const subscription = await prisma.subscription.findUnique({
            where: { userId: user.id },
            select: { tier: true },
          })
          token.tier = (subscription?.tier as SubscriptionTier) || 'FREE'
        } catch (error) {
          console.warn(
            'Failed to load subscription tier, defaulting to FREE:',
            error,
          )
          token.tier = 'FREE'
        }
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

export async function auth() {
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
      tier: (token.tier || 'FREE') as SubscriptionTier,
    },
  }
}

const handler = NextAuth(authOptions)
export default handler
