import type { User } from '@/types/prisma'

const normalizeEmail = (value: string | undefined | null): string =>
  (value ?? '').trim().toLowerCase()

const parseBoolean = (
  value: string | undefined,
  defaultValue: boolean
): boolean => {
  if (value === undefined) {
    return defaultValue
  }
  return value.trim().toLowerCase() === 'true'
}

export type DemoAccountContext = {
  enabled: boolean
  bypassAuth: boolean
  id: string
  name: string
  email: string
  password: string
}

export const isStrictAuthRequired = (): boolean =>
  process.env.AUTH_REQUIRE_LOGIN === 'true' ||
  process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN === 'true'

export const getDemoAccountContext = (): DemoAccountContext => {
  const isDevelopment = process.env.NODE_ENV !== 'production'
  const rawEnabled =
    process.env.DEMO_ACCOUNT_ENABLED ?? process.env.NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED
  const rawBypass =
    process.env.DEMO_ACCOUNT_BYPASS_AUTH ??
    process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH
  const email = normalizeEmail(
    process.env.DEMO_ACCOUNT_EMAIL || process.env.NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL || 'demo@local.dev'
  )

  return {
    enabled: parseBoolean(rawEnabled, true),
    bypassAuth: parseBoolean(rawBypass, isDevelopment),
    id: process.env.DEMO_ACCOUNT_ID || 'demo-user',
    name: process.env.DEMO_ACCOUNT_NAME || 'Demo User',
    email,
    password: process.env.DEMO_ACCOUNT_PASSWORD || 'demo12345',
  }
}

export const isDemoEmail = (email: string | undefined | null): boolean => {
  const demo = getDemoAccountContext()
  return demo.enabled && normalizeEmail(email) === demo.email
}

export const isDemoCredentials = (
  email: string | undefined | null,
  password: string | undefined | null
): boolean => {
  const demo = getDemoAccountContext()
  if (!demo.enabled) {
    return false
  }
  return normalizeEmail(email) === demo.email && (password ?? '') === demo.password
}

export const createDemoAuthUser = () => {
  const demo = getDemoAccountContext()
  return {
    id: demo.id,
    name: demo.name,
    email: demo.email,
  }
}

export const createDemoUserRecord = (): User => {
  const demo = getDemoAccountContext()
  const now = new Date(0)
  return {
    id: demo.id,
    name: demo.name,
    email: demo.email,
    createdAt: now,
    updatedAt: now,
  }
}

export const createGuestUserRecord = (): User => {
  const now = new Date(0)
  return {
    id: process.env.GUEST_USER_ID || 'guest-local-user',
    name: process.env.GUEST_USER_NAME || 'Guest User',
    email: process.env.GUEST_USER_EMAIL || 'guest@local.dev',
    createdAt: now,
    updatedAt: now,
  }
}
