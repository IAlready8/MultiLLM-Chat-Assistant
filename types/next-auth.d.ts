import NextAuth, { DefaultSession } from 'next-auth'

type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE'
type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER'

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's id. */
      id: string
      role: TeamRole
      tier: SubscriptionTier
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: TeamRole
    tier?: SubscriptionTier
  }
}
