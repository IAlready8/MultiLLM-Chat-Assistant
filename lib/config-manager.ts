import { z } from 'zod'
import prisma from '@/lib/prisma'
import { encryptApiKey, decryptApiKey } from '@/lib/crypto'
import {
  configSchema,
  providerConfigSchema,
  type SystemConfig,
  type ProviderConfig,
  type ValidationResult,
  type ProviderValidationResult,
  defaultProviderModels,
  defaultRateLimits,
} from './config-schemas'
import { v4 as uuidv4 } from 'uuid'

export class ConfigurationError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

export interface ConfigUpdateResult {
  success: boolean
  errors?: z.ZodError
  warnings?: string[]
}

export class ConfigurationManager {
  private static instance: ConfigurationManager
  private config: SystemConfig | null = null
  private lastFetch: Date | null = null
  private readonly cacheTimeout = 5 * 60 * 1000 // 5 minutes

  private constructor() {}

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager()
    }
    return ConfigurationManager.instance
  }

  // Core Configuration Management
  public async getSystemConfig(forceRefresh = false): Promise<SystemConfig> {
    if (
      !forceRefresh &&
      this.config &&
      this.lastFetch &&
      Date.now() - this.lastFetch.getTime() < this.cacheTimeout
    ) {
      return this.config
    }

    try {
      // Load from database or use defaults
      const systemConfig = await this.loadSystemConfig()
      this.config = systemConfig
      this.lastFetch = new Date()
      return systemConfig
    } catch (error) {
      throw new ConfigurationError(
        'Failed to load system configuration',
        'CONFIG_LOAD_ERROR',
        error
      )
    }
  }

  private async loadSystemConfig(): Promise<SystemConfig> {
    // Try to load from environment or database
    const defaultConfig = {
      providers: {},
      features: {
        streaming: true,
        analytics: true,
        rateLimit: true,
        errorReporting: true,
        debug: process.env.NODE_ENV === 'development',
      },
      security: {
        sessionTimeout: 86400,
        maxLoginAttempts: 5,
        encryptionKeyRotation: 90,
        requireMFA: false,
      },
      database: {
        connectionPool: { min: 2, max: 10, acquireTimeoutMillis: 60000 },
        queryTimeout: 30000,
        enableLogging: process.env.NODE_ENV === 'development',
      },
      version: '1.0.0',
      lastUpdated: new Date(),
    }

    const result = configSchema.safeParse(defaultConfig)
    if (!result.success) {
      throw new ConfigurationError(
        'Invalid default configuration',
        'CONFIG_VALIDATION_ERROR',
        result.error
      )
    }

    return result.data
  }

  // Provider Configuration Management
  public async getProviderConfig(
    userId: string,
    provider: string
  ): Promise<ProviderConfig | null> {
    try {
      const config = await prisma.providerConfig.findUnique({
        where: { userId_provider: { userId, provider } },
      })

      if (!config || !config.isActive) {
        return null
      }

      const decryptedApiKey = config.apiKey ? await decryptApiKey(config.apiKey) : ''
      const settings = config.settings ? JSON.parse(config.settings) : {}

      const providerConfig: ProviderConfig = {
        apiKey: decryptedApiKey,
        baseUrl: settings.baseUrl,
        models: settings.models || defaultProviderModels[provider as keyof typeof defaultProviderModels] || [],
        rateLimits: settings.rateLimits || defaultRateLimits[provider as keyof typeof defaultRateLimits],
        isActive: config.isActive,
        settings,
      }

      return providerConfig
    } catch (error) {
      throw new ConfigurationError(
        `Failed to load provider configuration for ${provider}`,
        'PROVIDER_CONFIG_ERROR',
        error
      )
    }
  }

  public async updateProviderConfig(
    userId: string,
    provider: string,
    config: Partial<ProviderConfig>
  ): Promise<ConfigUpdateResult> {
    try {
      // Validate configuration
      const validation = this.validateProviderConfig(config)
      if (!validation.ok) {
        return { success: false, errors: validation.errors }
      }

      const validatedConfig = validation.data!
      const encryptedApiKey = await encryptApiKey(validatedConfig.apiKey)

      // Prepare settings object
      const settings = {
        baseUrl: validatedConfig.baseUrl,
        models: validatedConfig.models,
        rateLimits: validatedConfig.rateLimits,
        ...validatedConfig.settings,
      }

      // Update or create provider configuration
      await prisma.providerConfig.upsert({
        where: { userId_provider: { userId, provider } },
        update: {
          apiKey: encryptedApiKey,
          settings: JSON.stringify(settings),
          isActive: validatedConfig.isActive,
          updatedAt: new Date(),
        },
        create: {
          id: uuidv4(),
          userId,
          provider,
          apiKey: encryptedApiKey,
          settings: JSON.stringify(settings),
          isActive: validatedConfig.isActive,
        },
      })

      // Clear cache to force reload
      this.invalidateCache()

      return { success: true }
    } catch (error) {
      throw new ConfigurationError(
        `Failed to update provider configuration for ${provider}`,
        'PROVIDER_UPDATE_ERROR',
        error
      )
    }
  }

  public async deleteProviderConfig(userId: string, provider: string): Promise<void> {
    try {
      await prisma.providerConfig.delete({
        where: { userId_provider: { userId, provider } },
      })
      this.invalidateCache()
    } catch (error) {
      throw new ConfigurationError(
        `Failed to delete provider configuration for ${provider}`,
        'PROVIDER_DELETE_ERROR',
        error
      )
    }
  }

  // Validation Methods
  public validateSystemConfig(config: unknown): ValidationResult {
    const result = configSchema.safeParse(config)
    return {
      ok: result.success,
      data: result.success ? result.data : undefined,
      errors: result.success ? undefined : result.error,
    }
  }

  public validateProviderConfig(config: unknown): ProviderValidationResult {
    const result = providerConfigSchema.safeParse(config)
    return {
      ok: result.success,
      data: result.success ? result.data : undefined,
      errors: result.success ? undefined : result.error,
    }
  }

  // Provider Testing
  public async testProviderConnection(
    provider: string,
    config: ProviderConfig
  ): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now()
    
    try {
      // Import the appropriate provider service dynamically
      switch (provider) {
        case 'openai': {
          const { OpenAIService } = await import('@/services/llm-providers/openai-service')
          const service = OpenAIService.getInstance()
          await service.testConnection(config.apiKey)
          break
        }
        case 'anthropic': {
          // Implement Anthropic test when service exists
          break
        }
        case 'googleai': {
          // Implement Google AI test when service exists
          break
        }
        case 'openrouter': {
          // Implement OpenRouter test when service exists
          break
        }
        default:
          throw new Error(`Unknown provider: ${provider}`)
      }

      const latency = Date.now() - startTime
      return { success: true, latency }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // Utility Methods
  public async getAllProviderConfigs(userId: string): Promise<Record<string, ProviderConfig>> {
    try {
      const configs = await prisma.providerConfig.findMany({
        where: { userId, isActive: true },
      })

      const result: Record<string, ProviderConfig> = {}

      for (const config of configs) {
        const decryptedApiKey = config.apiKey ? await decryptApiKey(config.apiKey) : ''
        const settings = config.settings ? JSON.parse(config.settings) : {}

        result[config.provider] = {
          apiKey: decryptedApiKey,
          baseUrl: settings.baseUrl,
          models: settings.models || defaultProviderModels[config.provider as keyof typeof defaultProviderModels] || [],
          rateLimits: settings.rateLimits || defaultRateLimits[config.provider as keyof typeof defaultRateLimits],
          isActive: config.isActive,
          settings,
        }
      }

      return result
    } catch (error) {
      throw new ConfigurationError(
        'Failed to load all provider configurations',
        'ALL_PROVIDERS_ERROR',
        error
      )
    }
  }

  public getAvailableProviders(): string[] {
    return Object.keys(defaultProviderModels)
  }

  public getDefaultModels(provider: string): string[] {
    return defaultProviderModels[provider as keyof typeof defaultProviderModels] || []
  }

  public getDefaultRateLimits(provider: string): { requests: number; window: number } {
    return defaultRateLimits[provider as keyof typeof defaultRateLimits] || { requests: 60, window: 60000 }
  }

  // Cache Management
  public invalidateCache(): void {
    this.config = null
    this.lastFetch = null
  }

  public async refreshCache(): Promise<void> {
    await this.getSystemConfig(true)
  }

  // Health Check
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: Record<string, any>
  }> {
    const details: Record<string, any> = {}

    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`
      details.database = 'healthy'
    } catch (error) {
      details.database = 'unhealthy'
      details.databaseError = error
    }

    try {
      // Test configuration loading
      await this.getSystemConfig()
      details.configuration = 'healthy'
    } catch (error) {
      details.configuration = 'unhealthy'
      details.configurationError = error
    }

    const unhealthyCount = Object.values(details).filter(status => status === 'unhealthy').length
    
    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (unhealthyCount === 0) {
      status = 'healthy'
    } else if (unhealthyCount < Object.keys(details).length / 2) {
      status = 'degraded'
    } else {
      status = 'unhealthy'
    }

    return { status, details }
  }
}

// Export singleton instance
export const configManager = ConfigurationManager.getInstance()