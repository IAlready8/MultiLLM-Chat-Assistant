import { z } from 'zod'

// bcrypt only uses the first 72 bytes of a password; longer inputs would be
// silently truncated, so the length is capped up front.
export const MAX_PASSWORD_BYTES = 72

export const newPasswordSchema = z
  .string()
  .min(8)
  .max(MAX_PASSWORD_BYTES)
  .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, {
    message: 'Use at least 8 characters and at most 72 UTF-8 bytes.',
  })
