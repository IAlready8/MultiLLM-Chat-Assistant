import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { storeUserApiKey, getUserProviderConfigs, deleteUserProviderConfig } from '@/lib/api-key-service'
import {
  mergeAttributionIntoPayload,
  readAttributionFromCookieHeader,
} from '@/lib/acquisition-attribution'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'
import { recordAnalyticsEvent } from '@/services/analytics-service'

const normalizeProvider = (provider: string) => provider.trim().toLowerCase()

export async function GET() {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const configs = await getUserProviderConfigs(user.id)
    const configuredProviders = configs.map(c => c.provider)

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
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await request.json()
  const providerRaw = body?.provider
  const apiKeyRaw = body?.apiKey

  if (!providerRaw || typeof providerRaw !== 'string') {
    return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
  }

  const provider = normalizeProvider(providerRaw)

  // Validate provider
  if (!defaultProviderModels[provider as keyof typeof defaultProviderModels]) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
  }

  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : ''
  if (!apiKey) {
    // Delete provider configuration if no API key provided
    try {
      await deleteUserProviderConfig(user.id, provider)
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
  const models = defaultProviderModels[provider as keyof typeof defaultProviderModels] || []
  const rateLimits = defaultRateLimits[provider as keyof typeof defaultRateLimits] || {
    requests: 60,
    window: 60000,
  }

  const settings = {
    models,
    rateLimits
  }

  try {
    await storeUserApiKey(user.id, provider, apiKey, settings)
    try {
      const attribution = readAttributionFromCookieHeader(
        request.headers.get('cookie')
      )
      await recordAnalyticsEvent({
        event: 'provider_configured',
        userId: user.id,
        payload: mergeAttributionIntoPayload({ provider }, attribution),
      })
    } catch (analyticsError) {
      console.warn(
        'Failed to record analytics event for provider configuration.',
        analyticsError
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to store API key.')
    return NextResponse.json(
      { error: 'Failed to store API key securely' },
      { status: 500 }
    )
  }
}
