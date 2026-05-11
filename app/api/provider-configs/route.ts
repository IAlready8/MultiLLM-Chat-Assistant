import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  storeUserApiKey,
  getUserProviderConfigs,
  deleteUserProviderConfig,
} from '@/lib/api-key-service'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'
import { testProviderKey, validateApiKeyFormat } from '@/lib/provider-key-test'
import {
  invalidateReadCache,
  logReadCacheMetrics,
  withReadCache,
} from '@/lib/api-read-cache'

const normalizeProvider = (provider: string) => provider.trim().toLowerCase()

const SUPPORTED_PROVIDERS = Object.keys(defaultProviderModels)
const providerConfigsCacheKeyForUser = (userId: string) => `provider-configs:${userId}`

function isSupportedProvider(provider: string): boolean {
  return SUPPORTED_PROVIDERS.includes(provider)
}

function buildProviderSettings(
  provider: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const models =
    Array.isArray(config.models) && config.models.length > 0
      ? config.models
      : defaultProviderModels[provider as keyof typeof defaultProviderModels] ?? []

  const rateLimits =
    config.rateLimits &&
    typeof config.rateLimits === 'object' &&
    !Array.isArray(config.rateLimits)
      ? config.rateLimits
      : defaultRateLimits[provider as keyof typeof defaultRateLimits] ?? {
          requests: 60,
          window: 60000,
        }

  const nestedSettings =
    config.settings && typeof config.settings === 'object' && !Array.isArray(config.settings)
      ? (config.settings as Record<string, unknown>)
      : {}

  const passthroughSettings = Object.fromEntries(
    Object.entries(config).filter(
      ([key]) =>
        key !== 'apiKey' &&
        key !== 'models' &&
        key !== 'rateLimits' &&
        key !== 'settings'
    )
  )

  return {
    ...nestedSettings,
    ...passthroughSettings,
    models,
    rateLimits,
  }
}

export async function GET() {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const cachedResult = await withReadCache(providerConfigsCacheKeyForUser(user.id), () =>
      getUserProviderConfigs(user.id)
    )
    logReadCacheMetrics('/api/provider-configs', cachedResult.source, cachedResult.durationMs)
    const configs = cachedResult.value

    const mappedConfigs: Record<string, {
      provider: string
      isActive: boolean
      apiKey: string
      models: string[]
      rateLimits: { requests: number; window: number }
      settings?: Record<string, unknown>
    }> = {}

    for (const config of configs) {
      const models =
        config.settings?.models ??
        defaultProviderModels[config.provider as keyof typeof defaultProviderModels] ??
        []
      const rateLimits =
        config.settings?.rateLimits ??
        defaultRateLimits[config.provider as keyof typeof defaultRateLimits] ??
        { requests: 60, window: 60000 }

      mappedConfigs[config.provider] = {
        provider: config.provider,
        isActive: config.isActive,
        apiKey: '',
        models: models as string[],
        rateLimits: rateLimits as { requests: number; window: number },
        settings: config.settings,
      }
    }

    return NextResponse.json(
      { configs: mappedConfigs },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-Read-Cache': cachedResult.source },
      }
    )
  } catch (error) {
    console.error('Error getting provider configs:', error)
    return NextResponse.json(
      { error: 'Failed to get provider configurations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const body = await request.json()
    const { provider: providerRaw, config } = body

    if (!providerRaw || typeof providerRaw !== 'string') {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    const provider = normalizeProvider(providerRaw)

    if (!isSupportedProvider(provider)) {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      )
    }

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { error: 'Config object is required' },
        { status: 400 }
      )
    }

    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          errors: [
            { path: 'apiKey', message: 'API key is required and must be valid' },
          ],
        },
        { status: 400 }
      )
    }

    const settings = buildProviderSettings(provider, config as Record<string, unknown>)

    await storeUserApiKey(user.id, provider, apiKey, settings)
    invalidateReadCache(providerConfigsCacheKeyForUser(user.id))

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error updating provider config:', error)
    return NextResponse.json(
      { error: 'Failed to update provider configuration' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const body = await request.json()
    const { provider: providerRaw, config } = body

    if (!providerRaw || typeof providerRaw !== 'string') {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      )
    }

    const provider = normalizeProvider(providerRaw)

    if (!isSupportedProvider(provider)) {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 }
      )
    }

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { error: 'Config object is required' },
        { status: 400 }
      )
    }

    // Validate API key format if provided
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    if (!apiKey || apiKey.length < 10) {
      return NextResponse.json(
        {
          success: false,
          errors: [
            { path: 'apiKey', message: 'API key is required and must be valid' },
          ],
        },
        { status: 400 }
      )
    }

    const formatError = validateApiKeyFormat(provider, apiKey)
    if (formatError) {
      return NextResponse.json(
        {
          success: false,
          errors: [{ path: 'apiKey', message: formatError }],
        },
        { status: 400 }
      )
    }

    // Real connection test against provider API
    let connectionTest: {
      success: boolean
      latency: number
      reason?: string
    } = { success: false, latency: 0 }

    const startTime = Date.now()
    try {
      const response = await testProviderKey(provider, apiKey)
      const latency = Date.now() - startTime

      if (!response) {
        // Provider not testable (e.g. grok) — format-only validation passed
        connectionTest = { success: true, latency: 0 }
      } else if (response.ok) {
        connectionTest = { success: true, latency }
      } else if (response.status === 401 || response.status === 403) {
        connectionTest = {
          success: false,
          latency,
          reason: 'rejected',
        }
      } else if (response.status === 429) {
        connectionTest = {
          success: false,
          latency,
          reason: 'rate_limited',
        }
      } else {
        connectionTest = {
          success: false,
          latency,
          reason: `provider_error_${response.status}`,
        }
      }
    } catch {
      connectionTest = {
        success: false,
        latency: Date.now() - startTime,
        reason: 'unreachable',
      }
    }

    // If connection test passed, store the config
    if (connectionTest.success) {
      const settings = buildProviderSettings(provider, config as Record<string, unknown>)

      await storeUserApiKey(user.id, provider, apiKey, settings)
      invalidateReadCache(providerConfigsCacheKeyForUser(user.id))
    }

    return NextResponse.json(
      {
        success: connectionTest.success,
        data: connectionTest.success ? config : undefined,
        connectionTest,
      },
      { status: connectionTest.success ? 200 : 400 }
    )
  } catch (error) {
    console.error('Error validating provider config:', error)
    return NextResponse.json(
      { error: 'Failed to validate provider configuration' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { searchParams } = new URL(request.url)
    const providerRaw = searchParams.get('provider')

    if (!providerRaw) {
      return NextResponse.json(
        { error: 'Provider is required for deletion' },
        { status: 400 }
      )
    }

    const provider = normalizeProvider(providerRaw)

    await deleteUserProviderConfig(user.id, provider)
    invalidateReadCache(providerConfigsCacheKeyForUser(user.id))

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting provider config:', error)
    return NextResponse.json(
      { error: 'Failed to delete provider configuration' },
      { status: 500 }
    )
  }
}
