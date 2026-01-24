import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { configManager } from '@/lib/config-manager'
import { defaultProviderModels, defaultRateLimits } from '@/lib/config-schemas'

const normalizeProvider = (provider: string) => provider.trim().toLowerCase()

export async function GET() {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const configs = await configManager.getAllProviderConfigs(user.id)
  const configuredProviders = Object.keys(configs)

  const response = NextResponse.json({ configuredProviders })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST(request: NextRequest) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await request.json()
  const providerRaw = body?.provider
  const apiKeyRaw = body?.apiKey

  if (!providerRaw || typeof providerRaw !== 'string') {
    return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
  }

  const provider = normalizeProvider(providerRaw)
  const allowedProviders = new Set(configManager.getAvailableProviders())
  if (!allowedProviders.has(provider)) {
    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
  }

  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : ''
  if (!apiKey) {
    try {
      await configManager.deleteProviderConfig(user.id, provider)
    } catch (error) {
      console.warn(`Failed to delete provider config for ${provider}:`, error)
    }
    return NextResponse.json({ success: true })
  }

  const models =
    defaultProviderModels[provider as keyof typeof defaultProviderModels] || []
  const rateLimits =
    defaultRateLimits[provider as keyof typeof defaultRateLimits] || {
      requests: 60,
      window: 60000,
    }

  const updateResult = await configManager.updateProviderConfig(user.id, provider, {
    apiKey,
    models,
    rateLimits,
    isActive: true,
  })

  if (!updateResult.success) {
    return NextResponse.json(
      { error: 'Invalid provider configuration', details: updateResult.errors },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
