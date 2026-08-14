import { isProviderApiKeyRequired } from './provider-registry'
import { DEEPSEEK_BASE_URL } from './providers/deepseek'
import { getProviderBaseUrl, providerFetch } from './provider-endpoint'

export type ProviderKeyTestOptions = {
  baseUrl?: unknown
}

export const validateApiKeyFormat = (
  provider: string,
  apiKey: string
): string | null => {
  const requiresApiKey = isProviderApiKeyRequired(provider)

  if (!apiKey && !requiresApiKey) {
    return null
  }

  if (!apiKey || apiKey.length < 10) {
    return 'API key is too short.'
  }

  switch (provider) {
    case 'openai':
      return apiKey.startsWith('sk-')
        ? null
        : 'OpenAI keys should start with sk-.'
    case 'openrouter':
      return apiKey.startsWith('sk-or-')
        ? null
        : 'OpenRouter keys should start with sk-or-.'
    case 'anthropic':
      return apiKey.startsWith('sk-ant-')
        ? null
        : 'Anthropic keys should start with sk-ant-.'
    case 'googleai':
      return apiKey.startsWith('AIza')
        ? null
        : 'Google AI keys should start with AIza.'
    case 'grok':
      return null
    case 'mistral':
      return null
    case 'kimi':
      return null
    case 'deepseek':
      return null
    case 'ollama':
      return null
    default:
      return null
  }
}

const fetchWithTimeout = async (
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs = 10000,
  options: ProviderKeyTestOptions = {},
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await providerFetch(
      provider,
      url,
      { ...init, signal: controller.signal },
      options,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export const testProviderKey = async (
  provider: string,
  apiKey: string,
  options: ProviderKeyTestOptions = {},
) => {
  switch (provider) {
    case 'openai':
      return fetchWithTimeout('openai', 'https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'openrouter':
      return fetchWithTimeout('openrouter', 'https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'anthropic':
      return fetchWithTimeout('anthropic', 'https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })
    case 'googleai':
      return fetchWithTimeout(
        'googleai',
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(
          apiKey
        )}`,
        { method: 'GET' }
      )
    case 'grok':
      return null
    case 'mistral':
      return fetchWithTimeout('mistral', 'https://api.mistral.ai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'kimi':
      return fetchWithTimeout('kimi', 'https://api.moonshot.ai/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'deepseek':
      return fetchWithTimeout('deepseek', `${DEEPSEEK_BASE_URL}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    case 'ollama':
      {
        const baseUrl = getProviderBaseUrl('ollama', options.baseUrl)
        return fetchWithTimeout(
          'ollama',
          `${baseUrl}/api/tags`,
          {
            method: 'GET',
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          },
          10000,
          { baseUrl },
        )
      }
    default:
      return null
  }
}
