import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'

const validateApiKeyFormat = (provider: string, apiKey: string): string | null => {
  if (!apiKey || apiKey.length < 10) {
    return 'API key is too short.'
  }

  switch (provider) {
    case 'openai':
      if (!apiKey.startsWith('sk-')) return 'OpenAI keys should start with sk-.'
      return null
    case 'openrouter':
      if (!apiKey.startsWith('sk-or-')) return 'OpenRouter keys should start with sk-or-.'
      return null
    case 'anthropic':
      if (!apiKey.startsWith('sk-ant-')) return 'Anthropic keys should start with sk-ant-.'
      return null
    case 'googleai':
      if (!apiKey.startsWith('AIza')) return 'Google AI keys should start with AIza.'
      return null
    case 'grok':
      return null
    default:
      return null
  }
}

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 10000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeout)
  }
}

const testProviderKey = async (provider: string, apiKey: string) => {
  switch (provider) {
    case 'openai':
      return fetchWithTimeout('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'openrouter':
      return fetchWithTimeout('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'anthropic':
      return fetchWithTimeout('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
    case 'googleai':
      return fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      )
    case 'grok':
      return null
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck

  const body = await request.json()
  const providerRaw = body?.provider
  const apiKeyRaw = body?.apiKey

  if (!providerRaw || typeof providerRaw !== 'string') {
    return NextResponse.json({ valid: false, message: 'Provider is required.' }, { status: 400 })
  }
  if (!apiKeyRaw || typeof apiKeyRaw !== 'string') {
    return NextResponse.json({ valid: false, message: 'API key is required.' }, { status: 400 })
  }

  const provider = providerRaw.trim().toLowerCase()
  const apiKey = apiKeyRaw.trim()

  const formatError = validateApiKeyFormat(provider, apiKey)
  if (formatError) {
    return NextResponse.json(
      { valid: false, message: formatError, reason: 'format' },
      { status: 200 }
    )
  }

  try {
    const response = await testProviderKey(provider, apiKey)
    if (!response) {
      return NextResponse.json({ valid: true, message: 'Format looks valid.' }, { status: 200 })
    }

    if (response.ok) {
      return NextResponse.json({ valid: true, message: 'API key verified successfully.' }, { status: 200 })
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { valid: false, message: 'Provider rejected this API key.', reason: 'rejected' },
        { status: 200 }
      )
    }

    if (response.status === 429) {
      return NextResponse.json(
        { valid: false, message: 'Rate limited while verifying key. Try again shortly.', reason: 'unverified' },
        { status: 200 }
      )
    }

    if (response.status >= 500) {
      return NextResponse.json(
        { valid: false, message: 'Provider error while verifying key. Try again later.', reason: 'unverified' },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { valid: false, message: `Provider responded with HTTP ${response.status}.`, reason: 'provider_error' },
      { status: 200 }
    )
  } catch (error) {
    console.error('API key verification error:', error)
    return NextResponse.json(
      { valid: false, message: 'Failed to reach provider to verify key.', reason: 'unverified' },
      { status: 200 }
    )
  }
}
