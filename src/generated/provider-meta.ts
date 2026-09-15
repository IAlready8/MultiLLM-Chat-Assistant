// AUTO-GENERATED from config/capability-matrix.yaml - DO NOT EDIT
export interface ProviderMeta {
  id: ProviderId;
  name: string;
  placeholder: string;
  description: string;
  requiresApiKey: boolean;
  acceptsApiKey?: boolean;
  operational?: boolean;
  disabledReason?: string;
}

export const allProviderIds = [
  "openai",
  "openrouter",
  "anthropic",
  "googleai",
  "grok",
  "ollama",
  "mistral",
  "kimi",
  "deepseek"
] as const;

export type ProviderId = typeof allProviderIds[number];

export const providerRegistry: readonly ProviderMeta[] = [
  {
    "id": "openai",
    "name": "OpenAI",
    "placeholder": "sk-...",
    "description": "Strong general-purpose reasoning, writing, and coding models.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "openrouter",
    "name": "OpenRouter",
    "placeholder": "sk-or-v1-...",
    "description": "Unified routing across many hosted model providers.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "anthropic",
    "name": "Claude (Anthropic)",
    "placeholder": "sk-ant-...",
    "description": "Long-context Claude models for analysis and writing.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "googleai",
    "name": "Google AI",
    "placeholder": "AIza...",
    "description": "Gemini models for fast multimodal and long-context work.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "grok",
    "name": "Grok (xAI)",
    "placeholder": "xai-...",
    "description": "xAI models for conversational exploration.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "ollama",
    "name": "Ollama",
    "placeholder": "Optional bearer token for remote Ollama",
    "description": "Local models served by Ollama at http://localhost:11434.",
    "requiresApiKey": false,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "mistral",
    "name": "Mistral",
    "placeholder": "Mistral API key",
    "description": "Mistral hosted models and open-weight families.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "kimi",
    "name": "Kimi (Moonshot AI)",
    "placeholder": "Kimi API key",
    "description": "Long-context Kimi models for reasoning, writing, and coding.",
    "requiresApiKey": true,
    "acceptsApiKey": true,
    "operational": true
  },
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "placeholder": "Currently unavailable",
    "description": "Temporarily disabled because the previous community endpoint is no longer operational.",
    "requiresApiKey": false,
    "acceptsApiKey": false,
    "operational": false,
    "disabledReason": "DeepSeek is currently unavailable."
  }
];

export const operationalProviderRegistry = providerRegistry.filter(provider => provider.operational !== false);
export const supportedProviderIds = operationalProviderRegistry.map(provider => provider.id);

export const getProviderMeta = (id: string) =>
  providerRegistry.find(provider => provider.id === id);

export const isProviderApiKeyRequired = (id: string) =>
  getProviderMeta(id)?.requiresApiKey ?? true;
