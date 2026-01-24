import NextAuth, { DefaultSession } from "next-auth";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Define the types for subscription tier and team role as strings
type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';
type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

// Augment the NextAuth session to include our custom properties
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: TeamRole;
      tier: SubscriptionTier;
    } & DefaultSession['user'];
  }

  interface JWT {
    id?: string;
    role?: TeamRole;
    tier?: SubscriptionTier;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: TeamRole;
    tier?: SubscriptionTier;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const email = credentials.email.toLowerCase().trim();
          const name = credentials.name?.trim();
          const user = await prisma.user.findUnique({
            where: { email }
          });

          if (!user) {
            if (!name) {
              return null;
            }

            const hashedPassword = await bcrypt.hash(credentials.password, 10);
            const created = await prisma.user.create({
              data: {
                name,
                email,
                password: hashedPassword
              }
            });

            return {
              id: created.id,
              name: created.name,
              email: created.email
            };
          }

          if (!user.password) {
            return null;
          }

          const isValidPassword = await bcrypt.compare(credentials.password, user.password);
          if (!isValidPassword) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email
          };
        } catch (error) {
          console.error("Auth error:", error);
        }

        return null;
      }
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = "MEMBER";
        const subscription = await prisma.subscription.findUnique({
          where: { userId: user.id },
          select: { tier: true },
        });
        token.tier = (subscription?.tier as SubscriptionTier) || "FREE";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = token.id || token.sub;
        if (userId) {
          session.user.id = userId;
        }
        session.user.role = token.role || "MEMBER";
        session.user.tier = token.tier || "FREE";
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours - reduce session updates
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Export auth function for server-side session retrieval (NextAuth v4 pattern)
import { getServerSession } from "next-auth/next";
export async function auth() {
  return await getServerSession(authOptions);
}

// Export for API routes
const handler = NextAuth(authOptions);
export default handler;
