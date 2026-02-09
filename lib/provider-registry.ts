export interface ProviderMeta {
  id: string
  name: string
  placeholder: string
}

export const providerRegistry: ProviderMeta[] = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-v1-...' },
  { id: 'anthropic', name: 'Claude (Anthropic)', placeholder: 'sk-ant-...' },
  { id: 'googleai', name: 'Google AI', placeholder: 'AIza...' },
  { id: 'grok', name: 'Grok (xAI)', placeholder: 'xai-...' },
]

export const supportedProviderIds = providerRegistry.map((provider) => provider.id)
