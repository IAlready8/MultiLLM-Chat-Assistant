import { z } from 'zod'

const identitySchema = z.object({
  operator: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(254),
  backupHours: z.coerce.number().int().min(1).max(8760),
})

export function readLegalPublication() {
  if (process.env.LEGAL_NOTICE_APPROVED !== 'true') return null
  const result = identitySchema.safeParse({
    operator: process.env.LEGAL_OPERATOR_NAME,
    email: process.env.SUPPORT_EMAIL,
    backupHours: process.env.LEGAL_BACKUP_RETENTION_HOURS,
  })
  if (!result.success) return null
  const { operator, email } = result.data
  if (/unconfirmed|placeholder|draft only|\[|\]/i.test(operator) || /@(?:example\.(?:com|org|net)|[^@]+\.(?:test|invalid))$/i.test(email)) return null
  return result.data
}

export const isPaidSignupEnabled = () => process.env.PAID_SIGNUP_ENABLED === 'true' && readLegalPublication() !== null
