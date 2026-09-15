// AUTO-GENERATED from config/capability-matrix.yaml - DO NOT EDIT
export const providerCapabilities = {
  "openai": {
    "streaming": true,
    "supportsTools": true,
    "requiresApiKey": true,
    "defaultModel": "gpt-4o"
  },
  "openrouter": {
    "streaming": true,
    "supportsTools": true,
    "requiresApiKey": true,
    "defaultModel": "openai/gpt-4o"
  },
  "anthropic": {
    "streaming": true,
    "supportsTools": true,
    "requiresApiKey": true,
    "defaultModel": "claude-3-5-sonnet-20241022"
  },
  "googleai": {
    "streaming": true,
    "supportsTools": false,
    "requiresApiKey": true,
    "defaultModel": "gemini-1.5-pro"
  },
  "grok": {
    "streaming": true,
    "supportsTools": true,
    "requiresApiKey": true,
    "defaultModel": "grok-2"
  },
  "ollama": {
    "streaming": true,
    "supportsTools": false,
    "requiresApiKey": false,
    "defaultModel": "llama3.1"
  },
  "mistral": {
    "streaming": true,
    "supportsTools": true,
    "requiresApiKey": true,
    "defaultModel": "mistral-large-latest"
  },
  "kimi": {
    "streaming": true,
    "supportsTools": true,
    "requiresApiKey": true,
    "defaultModel": "kimi-k3"
  },
  "deepseek": {
    "streaming": false,
    "supportsTools": false,
    "requiresApiKey": false,
    "defaultModel": "unavailable"
  }
} as const;

export type ProviderCapabilities = typeof providerCapabilities;

export function getCapabilities(provider: string) {
  return (providerCapabilities as Record<string, {
    streaming: boolean;
    supportsTools: boolean;
    requiresApiKey: boolean;
    defaultModel: string;
  }>)[provider] ?? {
    streaming: false,
    supportsTools: false,
    requiresApiKey: true,
    defaultModel: '',
  };
}
