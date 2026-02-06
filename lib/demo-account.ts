import type { User } from '@/types/prisma'

const normalizeEmail = (value: string | undefined | null): string =>
  (value ?? '').trim().toLowerCase()

export type DemoAccountContext = {
  enabled: boolean
  bypassAuth: boolean
  id: string
  name: string
  email: string
  password: string
}

export const getDemoAccountContext = (): DemoAccountContext => {
  const email = normalizeEmail(
    process.env.DEMO_ACCOUNT_EMAIL || process.env.NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL || 'demo@local.dev'
  )

  return {
    enabled: process.env.DEMO_ACCOUNT_ENABLED !== 'false',
    bypassAuth: process.env.DEMO_ACCOUNT_BYPASS_AUTH === 'true',
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
