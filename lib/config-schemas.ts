import { z } from 'zod'
import { providerRegistry, supportedProviderIds, type ProviderMeta } from './provider-registry'
import { getAllProviderIds, getModelsForProvider } from './model-catalog'

// Provider Configuration Schemas
export const providerConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().optional(),
  models: z.array(z.string()),
  rateLimits: z.object({
    requests: z.number().min(1),
    window: z.number().min(1000), // milliseconds
  }),
  isActive: z.boolean().default(true),
  settings: z.record(z.string(), z.any()).optional(),
})

export const openAIConfigSchema = providerConfigSchema.extend({
  organization: z.string().optional(),
  maxTokens: z.number().min(1).max(100000).default(4096),
})

export const anthropicConfigSchema = providerConfigSchema.extend({
  version: z.string().default('2023-06-01'),
  maxTokens: z.number().min(1).max(200000).default(4096),
})

export const googleAIConfigSchema = providerConfigSchema.extend({
  safetySettings: z.array(z.object({
    category: z.string(),
    threshold: z.string(),
  })).optional(),
})

export const openRouterConfigSchema = providerConfigSchema.extend({
  httpReferer: z.string().url().optional(),
  xTitle: z.string().optional(),
})

export const grokConfigSchema = providerConfigSchema.extend({
  maxTokens: z.number().min(1).max(100000).default(4096),
})

export const ollamaConfigSchema = providerConfigSchema.extend({
  baseUrl: z.string().url().default('http://localhost:11434'),
}).optional()

export const mistralConfigSchema = providerConfigSchema.extend({
  maxTokens: z.number().min(1).max(128000).default(4096),
}).optional()

export const kimiConfigSchema = providerConfigSchema.extend({
  maxTokens: z.number().min(1).max(1048576).default(4096),
}).optional()

// System Configuration Schemas
export const featuresConfigSchema = z.object({
  streaming: z.boolean().default(true),
  analytics: z.boolean().default(true),
  rateLimit: z.boolean().default(true),
  errorReporting: z.boolean().default(true),
  debug: z.boolean().default(false),
})

export const securityConfigSchema = z.object({
  sessionTimeout: z.number().min(300).default(86400), // 24 hours
  maxLoginAttempts: z.number().min(1).default(5),
  encryptionKeyRotation: z.number().min(1).default(90), // days
  requireMFA: z.boolean().default(false),
})

export const databaseConfigSchema = z.object({
  connectionPool: z.object({
    min: z.number().min(1).default(2),
    max: z.number().min(1).default(10),
    acquireTimeoutMillis: z.number().min(1000).default(60000),
  }),
  queryTimeout: z.number().min(1000).default(30000),
  enableLogging: z.boolean().default(false),
})

// Main Configuration Schema
export const configSchema = z.object({
  providers: z.object({
    openai: openAIConfigSchema.optional(),
    anthropic: anthropicConfigSchema.optional(),
    googleai: googleAIConfigSchema.optional(),
    openrouter: openRouterConfigSchema.optional(),
    grok: grokConfigSchema.optional(),
    ollama: ollamaConfigSchema,
    mistral: mistralConfigSchema,
    kimi: kimiConfigSchema,
  }),
  features: featuresConfigSchema,
  security: securityConfigSchema,
  database: databaseConfigSchema,
  version: z.string().default('1.0.0'),
  lastUpdated: z.date().default(() => new Date()),
})

// Type Exports
export type ProviderConfig = z.infer<typeof providerConfigSchema>
export type OpenAIConfig = z.infer<typeof openAIConfigSchema>
export type AnthropicConfig = z.infer<typeof anthropicConfigSchema>
export type GoogleAIConfig = z.infer<typeof googleAIConfigSchema>
export type OpenRouterConfig = z.infer<typeof openRouterConfigSchema>
export type GrokConfig = z.infer<typeof grokConfigSchema>
export type OllamaConfig = z.infer<typeof ollamaConfigSchema>
export type MistralConfig = z.infer<typeof mistralConfigSchema>
export type KimiConfig = z.infer<typeof kimiConfigSchema>
export type FeaturesConfig = z.infer<typeof featuresConfigSchema>
export type SecurityConfig = z.infer<typeof securityConfigSchema>
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>
export type SystemConfig = z.infer<typeof configSchema>

// Validation Result Types
export interface ValidationResult {
  ok: boolean
  data?: SystemConfig
  errors?: z.ZodError
}

export interface ProviderValidationResult {
  ok: boolean
  data?: ProviderConfig
  errors?: z.ZodError
}

// Provider Metadata (re-exported for compatibility)
export type { ProviderMeta }
export { providerRegistry, supportedProviderIds }

// Default Configurations
export const defaultProviderModels = Object.fromEntries(
  getAllProviderIds().map((providerId) => [
    providerId,
    getModelsForProvider(providerId).map((model) => model.id),
  ])
) as Record<string, string[]>

export const defaultRateLimits = {
  openai: { requests: 60, window: 60000 },
  anthropic: { requests: 50, window: 60000 },
  googleai: { requests: 60, window: 60000 },
  openrouter: { requests: 200, window: 60000 },
  grok: { requests: 60, window: 60000 },
  ollama: { requests: 1000, window: 60000 },
  mistral: { requests: 60, window: 60000 },
  kimi: { requests: 60, window: 60000 },
}
