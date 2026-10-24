import { z } from 'zod'

const MAX_SETTINGS_DEPTH = 32

const providerSettingsSchema = z.object({
  baseUrl: z.string().optional(),
  models: z.array(z.string()).optional(),
  rateLimits: z.object({
    requests: z.number().min(1),
    window: z.number().min(1000),
  }).strict().optional(),
  organization: z.string().optional(),
  maxTokens: z.number().min(1).optional(),
  version: z.string().optional(),
  safetySettings: z.array(z.object({
    category: z.string(),
    threshold: z.string(),
  }).strict()).optional(),
  httpReferer: z.string().optional(),
  xTitle: z.string().optional(),
  isActive: z.boolean().optional(),
  provider: z.string().optional(),
}).strict()

const providerInputSchema = providerSettingsSchema.extend({
  // The route validates the dedicated credential separately. It must never be
  // accepted as a member of the plaintext settings object.
  apiKey: z.unknown().optional(),
  settings: providerSettingsSchema.optional(),
})

export class ProviderSettingsError extends Error {
  readonly code = 'PROVIDER_SETTINGS_INVALID'

  constructor() {
    super('Only supported non-secret provider settings are allowed')
    this.name = 'ProviderSettingsError'
  }
}

function isCredentialField(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return /^(key|authorization|proxyauthorization|cookies?|setcookie|credentials?|passwd|pwd|signature)$/.test(normalized)
    || /(apikey|token|password|secret|secretkey|privatekey|signingkey|encryptionkey|seed)$/.test(normalized)
}

export function validateProviderSettingsInput(config: Record<string, unknown>): void {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'apiKey')), depth: 0 },
  ]
  while (pending.length) {
    const { value, depth } = pending.pop()!
    if (depth > MAX_SETTINGS_DEPTH) throw new ProviderSettingsError()
    if (Array.isArray(value)) {
      for (const item of value) pending.push({ value: item, depth: depth + 1 })
    } else if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (isCredentialField(key)) throw new ProviderSettingsError()
        pending.push({ value: item, depth: depth + 1 })
      }
    }
  }
  if (!providerInputSchema.safeParse(config).success) throw new ProviderSettingsError()
}

function sanitizeSettingValue(value: unknown, depth: number): unknown {
  // Legacy JSON can contain unsupported extension shapes. Preserve non-secret
  // fields without applying the write allowlist or rewriting their stored data.
  if (depth > MAX_SETTINGS_DEPTH) return null
  if (Array.isArray(value)) return value.map(item => sanitizeSettingValue(item, depth + 1))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !isCredentialField(key))
      .map(([key, item]) => [key, sanitizeSettingValue(item, depth + 1)]))
  }
  return value
}

export function publicProviderSettings(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return sanitizeSettingValue(value, 0) as Record<string, unknown>
}
