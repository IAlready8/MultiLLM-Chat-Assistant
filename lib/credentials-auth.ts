import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { checkAndConsume } from '@/lib/rate-limit'

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
})

// A fixed non-secret hash keeps missing-user and wrong-password checks closer
// in timing without creating an account or disclosing whether an email exists.
const DUMMY_PASSWORD_HASH =
  '$2b$10$9QvB9YjQaf3BpEPXlXONxOe1pG95R5lYbSxT7D2cfj5wOQF6WgZ4m'

export type CredentialsAuthUser = {
  id: string
  name: string | null
  email: string | null
}

export const authorizeCredentials = async (
  rawCredentials: Record<string, string> | undefined,
): Promise<CredentialsAuthUser | null> => {
  const parsed = credentialsSchema.safeParse(rawCredentials)
  if (!parsed.success) {
    return null
  }

  const email = parsed.data.email.toLowerCase()
  const password = parsed.data.password
  const rateResult = await checkAndConsume(`auth:login:${email}`, {
    windowMs: 15 * 60 * 1000,
    max: 10,
  })

  if (!rateResult.allowed) {
    return null
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    const passwordHash = user?.password || DUMMY_PASSWORD_HASH
    const passwordMatches = await bcrypt.compare(password, passwordHash)

    if (!user?.password || !passwordMatches) {
      return null
    }

    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
    }
  } catch (error) {
    console.error('Credential authentication store unavailable:', error)
    return null
  }
}
