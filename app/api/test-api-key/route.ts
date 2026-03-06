import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getUserApiKey } from '@/lib/api-key-service'
import { testProviderKey, validateApiKeyFormat } from '@/lib/provider-key-test'

type HealthStatus = 'ok' | 'invalid' | 'unreachable' | 'rate_limited' | 'provider_error' | 'format'

interface TestResult {
  valid: boolean
  message: string
  reason?: HealthStatus
  latencyMs?: number
}

function buildResult(
  valid: boolean,
  message: string,
  reason?: HealthStatus,
  latencyMs?: number
): TestResult {
  const result: TestResult = { valid, message }
  if (reason) result.reason = reason
  if (latencyMs !== undefined) result.latencyMs = latencyMs
  return result
}

async function testKey(
  provider: string,
  apiKey: string
): Promise<TestResult> {
  const formatError = validateApiKeyFormat(provider, apiKey)
  if (formatError) {
    return buildResult(false, formatError, 'format')
  }

  const startTime = Date.now()
  try {
    const response = await testProviderKey(provider, apiKey)
    const latencyMs = Date.now() - startTime

    if (!response) {
      return buildResult(true, 'Format looks valid.', undefined, 0)
    }

    if (response.ok) {
      return buildResult(true, 'API key verified successfully.', 'ok', latencyMs)
    }

    if (response.status === 401 || response.status === 403) {
      return buildResult(
        false,
        'Provider rejected this API key.',
        'invalid',
        latencyMs
      )
    }

    if (response.status === 429) {
      return buildResult(
        false,
        'Rate limited while verifying key. Try again shortly.',
        'rate_limited',
        latencyMs
      )
    }

    if (response.status >= 500) {
      return buildResult(
        false,
        'Provider error while verifying key. Try again later.',
        'provider_error',
        latencyMs
      )
    }

    return buildResult(
      false,
      `Provider responded with HTTP ${response.status}.`,
      'provider_error',
      latencyMs
    )
  } catch {
    const latencyMs = Date.now() - startTime
    return buildResult(
      false,
      'Failed to reach provider to verify key.',
      'unreachable',
      latencyMs
    )
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const body = await request.json()
    const providerRaw = body?.provider
    const testSaved = body?.testSaved === true

    if (!providerRaw || typeof providerRaw !== 'string') {
      return NextResponse.json(
        { valid: false, message: 'Provider is required.' },
        { status: 400 }
      )
    }

    const provider = providerRaw.trim().toLowerCase()

    // Mode 1: Test a saved/stored key without re-entry
    if (testSaved) {
      const savedKey = await getUserApiKey(user.id, provider)
      if (!savedKey) {
        return NextResponse.json(
          buildResult(false, 'No saved API key found for this provider.', 'invalid'),
          { status: 200 }
        )
      }

      const result = await testKey(provider, savedKey)
      return NextResponse.json(result, { status: 200 })
    }

    // Mode 2: Test a provided key (original behavior)
    const apiKeyRaw = body?.apiKey
    if (!apiKeyRaw || typeof apiKeyRaw !== 'string') {
      return NextResponse.json(
        { valid: false, message: 'API key is required.' },
        { status: 400 }
      )
    }

    const apiKey = apiKeyRaw.trim()
    const result = await testKey(provider, apiKey)
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Failed to test API key.')
    return NextResponse.json(
      buildResult(false, 'Failed to test API key.', 'unreachable'),
      { status: 500 }
    )
  }
}
