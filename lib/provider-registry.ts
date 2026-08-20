export interface ProviderMeta {
  id: string
  name: string
  placeholder: string
  description: string
  requiresApiKey: boolean
  /** False when the provider does not accept a user credential at all. */
  acceptsApiKey?: boolean
  /** False when the provider is retained for compatibility but unavailable to users. */
  operational?: boolean
  /** Sanitized explanation returned when a disabled provider is requested. */
  disabledReason?: string
}

export const PROVIDER_DISABLED_ERROR_CODE = 'PROVIDER_DISABLED'

export const providerRegistry: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-...',
    description: 'Strong general-purpose reasoning, writing, and coding models.',
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    placeholder: 'sk-or-v1-...',
    description: 'Unified routing across many hosted model providers.',
    requiresApiKey: true,
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    placeholder: 'sk-ant-...',
    description: 'Long-context Claude models for analysis and writing.',
    requiresApiKey: true,
  },
  {
    id: 'googleai',
    name: 'Google AI',
    placeholder: 'AIza...',
    description: 'Gemini models for fast multimodal and long-context work.',
    requiresApiKey: true,
  },
  {
    id: 'grok',
    name: 'Grok (xAI)',
    placeholder: 'xai-...',
    description: 'xAI models for conversational exploration.',
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    placeholder: 'Optional bearer token for remote Ollama',
    description: 'Local models served by Ollama at http://localhost:11434.',
    requiresApiKey: false,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    placeholder: 'Mistral API key',
    description: 'Mistral hosted models and open-weight families.',
    requiresApiKey: true,
  },
  {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    placeholder: 'Kimi API key',
    description: 'Long-context Kimi models for reasoning, writing, and coding.',
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    placeholder: 'DeepSeek API key',
    description: 'Official BYOK API. Usage is billed by DeepSeek to your DeepSeek account.',
    requiresApiKey: true,
    acceptsApiKey: true,
    operational: true,
  },
]

export const operationalProviderRegistry = providerRegistry.filter(
  (provider) => provider.operational !== false,
)

export const supportedProviderIds = operationalProviderRegistry.map(
  (provider) => provider.id,
)

export const getProviderMeta = (providerId: string) =>
  providerRegistry.find((provider) => provider.id === providerId)

export const isProviderApiKeyRequired = (providerId: string) =>
  getProviderMeta(providerId)?.requiresApiKey ?? true

export const isProviderOperational = (providerId: string) => {
  const provider = getProviderMeta(providerId)
  return Boolean(provider && provider.operational !== false)
}

export const isProviderDisabled = (providerId: string) =>
  getProviderMeta(providerId)?.operational === false

export const getProviderDisabledMessage = (providerId: string) =>
  getProviderMeta(providerId)?.disabledReason ?? 'Provider is currently unavailable.'
