import { NextRequest } from 'next/server'
import { aesGcmEncrypt, aesGcmDecrypt, deriveKey } from '@/lib/crypto'
import { ProviderConfig } from '@/lib/config-schemas'

// Get encryption key for API keys
async function getEncryptionKey() {
  const seed = process.env.API_KEY_ENCRYPTION_SEED || 'default-test-seed-12345678'
  return await deriveKey(seed)
}

// Mock storage for serverless environment (in production, use Vercel KV, Redis, or database)
const mockStorage = new Map<string, any>()

// Simple validation function for provider config
function validateProviderConfig(config: any) {
  // Check if required fields exist
  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.length < 10) {
    return {
      success: false,
      errors: [{ path: 'apiKey', message: 'API key is required and must be valid' }]
    }
  }

  if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
    return {
      success: false,
      errors: [{ path: 'models', message: 'At least one model must be specified' }]
    }
  }

  if (!config.rateLimits || typeof config.rateLimits !== 'object') {
    return {
      success: false,
      errors: [{ path: 'rateLimits', message: 'Rate limits are required' }]
    }
  }

  // If we reach here, config is valid
  return {
    success: true,
    data: config,
    connectionTest: {
      success: true,
      latency: Math.floor(Math.random() * 500) + 50 // Simulated latency between 50-550ms
    }
  }
}

export async function GET() {
  try {
    // Get stored configs from mock storage
    const storedConfigs = mockStorage.get('providerConfigs') || {}

    if (Object.keys(storedConfigs).length === 0) {
      return new Response(
        JSON.stringify({ configs: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      )
    }

    const encryptionKey = await getEncryptionKey()

    // Decrypt API keys for response
    const decryptedConfigs: Record<string, any> = {}
    for (const [provider, config] of Object.entries(storedConfigs)) {
      const configData = config as any
      decryptedConfigs[provider] = {
        ...configData,
        apiKey: configData.apiKey ? await aesGcmDecrypt(encryptionKey, configData.apiKey) : ''
      }
    }

    return new Response(
      JSON.stringify({ configs: decryptedConfigs }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error getting provider configs:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to get provider configurations' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, config } = body

    if (!provider || !config) {
      return new Response(
        JSON.stringify({ error: 'Provider and config are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const encryptionKey = await getEncryptionKey()

    // Encrypt API key before storing
    const configToStore = {
      ...config,
      apiKey: config.apiKey ? await aesGcmEncrypt(encryptionKey, config.apiKey) : ''
    }

    // Get existing configs
    let existingConfigs: Record<string, any> = mockStorage.get('providerConfigs') || {}

    // Update the specific provider config
    const updatedConfigs = {
      ...existingConfigs,
      [provider]: configToStore
    }

    // Store updated configs
    mockStorage.set('providerConfigs', updatedConfigs)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error updating provider config:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update provider configuration' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, config } = body

    if (!provider || !config) {
      return new Response(
        JSON.stringify({ error: 'Provider and config are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate the provider configuration
    const validation = validateProviderConfig(config)

    if (validation.success) {
      return new Response(
        JSON.stringify({
          success: true,
          data: validation.data,
          connectionTest: validation.connectionTest
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          errors: validation.errors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Error validating provider config:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to validate provider configuration' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'Provider is required for deletion' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get existing configs
    let existingConfigs: Record<string, any> = mockStorage.get('providerConfigs') || {}

    // Remove the specific provider config
    if (existingConfigs[provider]) {
      delete existingConfigs[provider]
      
      // Update the mock storage
      mockStorage.set('providerConfigs', existingConfigs)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error deleting provider config:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to delete provider configuration' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}