import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { storeUserApiKey, getUserProviderConfigs, deleteUserProviderConfig } from '@/lib/api-key-service'
import {
  mergeAttributionFromCookieHeader,
} from '@/lib/acquisition-attribution'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'
import {
  getProviderDisabledMessage,
  getProviderMeta,
  isProviderApiKeyRequired,
  isProviderDisabled,
  isProviderOperational,
  PROVIDER_DISABLED_ERROR_CODE,
} from '@/lib/provider-registry'
import { recordAnalyticsEvent } from '@/services/analytics-service'
import {
  apiReadCacheKey,
  invalidateApiReadCache,
} from '@/lib/api-read-cache'
import { getProviderBaseUrl, ProviderEndpointError } from '@/lib/provider-endpoint'

const normalizeProvider = (provider: string) => provider.trim().toLowerCase()

export async function GET() {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const configs = await getUserProviderConfigs(user.id)
    const configuredProviders = configs
      .map((config) => config.provider)
      .filter(isProviderOperational)

    const response = NextResponse.json({ configuredProviders })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to load provider configuration:', error)
    return NextResponse.json(
      { error: 'Failed to load provider configuration' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await request.json()
  const providerRaw = body?.provider
  const apiKeyRaw = body?.apiKey
  const clear = body?.clear === true

  if (!providerRaw || typeof providerRaw !== 'string') {
    return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
  }

  const provider = normalizeProvider(providerRaw)
  const providerMeta = getProviderMeta(provider)

  if (isProviderDisabled(provider)) {
    return NextResponse.json(
      {
        error: getProviderDisabledMessage(provider),
        code: PROVIDER_DISABLED_ERROR_CODE,
      },
      { status: 503 },
    )
  }

  // Validate provider
  if (!providerMeta || !defaultProviderModels[provider]) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
  }

  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : ''
  if (clear || (!apiKey && isProviderApiKeyRequired(provider))) {
    // Delete provider configuration if no API key provided
    try {
      await deleteUserProviderConfig(user.id, provider)
      invalidateApiReadCache(apiReadCacheKey('/api/provider-configs', user.id))
    } catch (error) {
      console.error(`Failed to delete provider config for ${provider}.`)
      return NextResponse.json(
        { error: 'Failed to clear provider configuration' },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true })
  }

  // Store API key with settings
  const models = defaultProviderModels[provider] || []
  const rateLimits = defaultRateLimits[provider as keyof typeof defaultRateLimits] || {
    requests: 60,
    window: 60000,
  }

  const settings = {
    models,
    rateLimits
  }

  try {
    getProviderBaseUrl(provider, undefined)
    await storeUserApiKey(user.id, provider, apiKey, settings)
    invalidateApiReadCache(apiReadCacheKey('/api/provider-configs', user.id))
    try {
      await recordAnalyticsEvent({
        event: 'provider_configured',
        userId: user.id,
        payload: mergeAttributionFromCookieHeader(
          { provider },
          request.headers.get('cookie')
        ),
      })
    } catch (analyticsError) {
      console.warn(
        'Failed to record analytics event for provider configuration.',
        analyticsError
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ProviderEndpointError) {
      return NextResponse.json(
        { error: 'Provider endpoint is not allowed', code: error.code },
        { status: 400 }
      )
    }
    console.error('Failed to store API key.')
    return NextResponse.json(
      { error: 'Failed to store API key securely' },
      { status: 500 }
    )
  }
}
