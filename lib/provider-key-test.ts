export const validateApiKeyFormat = (
  provider: string,
  apiKey: string
): string | null => {
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
    default:
      return null
  }
}

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = 10000
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export const testProviderKey = async (provider: string, apiKey: string) => {
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
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(
          apiKey
        )}`,
        { method: 'GET' }
      )
    case 'grok':
      return null
    default:
      return null
  }
}

