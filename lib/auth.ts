import NextAuth, { DefaultSession, NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import prisma from '@/lib/prisma'
import { checkAndConsume } from '@/lib/rate-limit'
import {
  createDemoAuthUser,
  getDemoAccountContext,
  isDemoCredentials,
  isDemoEmail,
  isStrictAuthRequired,
} from '@/lib/demo-account'

const PASSWORD_MIN_LENGTH = 8

// Define the types for subscription tier and team role as strings
type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE'
type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER'

// Augment the NextAuth session to include our custom properties
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

type InMemoryAuthUser = {
  id: string
  name: string
  email: string
  password: string
}

const inMemoryAuthUsers = new Map<string, InMemoryAuthUser>()

const normalizeEmail = (email: string) => email.toLowerCase().trim()
const strictAuth = isStrictAuthRequired()
let previewFallbackSecret: string | null = null

const buildPreviewFallbackSecret = (): string => {
  if (!previewFallbackSecret) {
    previewFallbackSecret = randomBytes(32).toString('hex')
  }
  return previewFallbackSecret
}

const resolveAuthSecret = (): string => {
  const configuredSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET

  if (configuredSecret?.trim()) {
    return configuredSecret.trim()
  }

  if (strictAuth) {
    throw new Error('NEXTAUTH_SECRET is required when AUTH_REQUIRE_LOGIN=true')
  }

  if (process.env.NODE_ENV !== 'production') {
    // Keep a stable local secret so JWT session cookies remain decryptable between reloads.
    return 'local-dev-nextauth-secret-change-before-production'
  }

  console.warn(
    '[auth] NEXTAUTH_SECRET is missing in production while strict auth is disabled; using an ephemeral fallback secret'
  )
  return buildPreviewFallbackSecret()
}

const authSecret = resolveAuthSecret()

const authLogger: NonNullable<NextAuthOptions['logger']> = {
  error(code, metadata) {
    if (!strictAuth && code === 'JWT_SESSION_ERROR') {
      return
    }
    console.error(`[next-auth][error][${code}]`, metadata ?? '')
  },
  warn(code) {
    if (!strictAuth && (code === 'NEXTAUTH_URL' || code === 'NO_SECRET')) {
      return
    }
    console.warn(`[next-auth][warn][${code}]`)
  },
  debug(code, metadata) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[next-auth][debug][${code}]`, metadata ?? '')
    }
  },
}

const buildProviders = () => {
  const providers: NextAuthOptions['providers'] = []

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    )
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })
    )
  }

  providers.push(
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        name: { label: 'Name', type: 'text' },
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = normalizeEmail(credentials.email)
        const name = credentials.name?.trim()
        const password = credentials.password

        if (isDemoCredentials(email, password)) {
          return createDemoAuthUser()
        }

        // Rate limit: 10 login attempts per email per 15 minutes
        const rateKey = `auth:login:${email}`
        const rateResult = await checkAndConsume(rateKey, {
          windowMs: 15 * 60 * 1000,
          max: 10,
        })
        if (!rateResult.allowed) {
          console.warn(`Rate limited login for ${email}`)
          return null
        }

        // Enforce minimum password length on signup
        if (name && password.length < PASSWORD_MIN_LENGTH) {
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          })

          if (!user) {
            if (!name) {
              return null
            }

            const hashedPassword = await bcrypt.hash(password, 10)
            const created = await prisma.user.create({
              data: {
                name,
                email,
                password: hashedPassword,
              },
            })

            return {
              id: created.id,
              name: created.name,
              email: created.email,
            }
          }

          if (!user.password) {
            return null
          }

          const isValidPassword = await bcrypt.compare(password, user.password)
          if (!isValidPassword) {
            return null
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
          }
        } catch (error) {
          console.warn('Primary auth store unavailable, falling back to in-memory auth:', error)
        }

        const localUser = inMemoryAuthUsers.get(email)
        if (!localUser) {
          if (!name) {
            return null
          }
          const hashedPassword = await bcrypt.hash(password, 10)
          const created: InMemoryAuthUser = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            email,
            password: hashedPassword,
          }
          inMemoryAuthUsers.set(email, created)
          return {
            id: created.id,
            name: created.name,
            email: created.email,
          }
        }

        const isValidPassword = await bcrypt.compare(password, localUser.password)
        if (!isValidPassword) {
          return null
        }

        return {
          id: localUser.id,
          name: localUser.name,
          email: localUser.email,
        }
      },
    })
  )

  return providers
}

const maybeAdapter = process.env.DATABASE_URL ? PrismaAdapter(prisma as any) : undefined

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
    async signIn({ user, account }) {
      // Audit log: record every sign-in attempt
      const method = account?.provider ?? 'credentials'
      console.info(
        `[auth] sign-in: user=${user?.email ?? 'unknown'} method=${method} id=${user?.id ?? 'none'}`
      )
      return true
    },
    async jwt({ token, user }) {
      if (!strictAuth && isDemoEmail(user?.email ?? token.email)) {
        token.id = user?.id || token.id || token.sub || getDemoAccountContext().id
        token.role = 'OWNER'
        token.tier = 'ENTERPRISE'
        return token
      }

      if (user) {
        token.id = user.id
        token.role = 'MEMBER'
        try {
          const subscription = await prisma.subscription.findUnique({
            where: { userId: user.id },
            select: { tier: true },
          })
          token.tier = (subscription?.tier as SubscriptionTier) || 'FREE'
        } catch (error) {
          console.warn('Failed to load subscription tier, defaulting to FREE:', error)
          token.tier = 'FREE'
        }
      }

      token.role = token.role || 'MEMBER'
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours - reduce session updates
  },
  secret: authSecret,
}

// Export auth function for server-side session retrieval (NextAuth v4 pattern)
import { getServerSession } from 'next-auth/next'
export async function auth() {
  return await getServerSession(authOptions)
}

// Export for API routes
const handler = NextAuth(authOptions)
export default handler
