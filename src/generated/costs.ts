// AUTO-GENERATED from config/capability-matrix.yaml - DO NOT EDIT
export const costTable = {
  "openai": {
    "prompt": 0.005,
    "completion": 0.015
  },
  "openrouter": {
    "prompt": 0.003,
    "completion": 0.01
  },
  "anthropic": {
    "prompt": 0.003,
    "completion": 0.015
  },
  "googleai": {
    "prompt": 0.0005,
    "completion": 0.0015
  },
  "grok": {
    "prompt": 0.005,
    "completion": 0.015
  },
  "ollama": {
    "prompt": 0,
    "completion": 0
  },
  "mistral": {
    "prompt": 0.002,
    "completion": 0.006
  },
  "kimi": {
    "prompt": 0.009,
    "completion": 0.009
  },
  "deepseek": {
    "prompt": 0,
    "completion": 0
  }
} as const;

export type CostTable = typeof costTable;

export function getCostRate(provider: string): { prompt: number; completion: number } {
  return (costTable as Record<string, { prompt: number; completion: number }>)[provider] ?? { prompt: 0.01, completion: 0.01 };
}

export function estimateCost(provider: string, totalTokens: number): number {
  const rate = getCostRate(provider);
  const avg = (rate.prompt + rate.completion) / 2;
  return (totalTokens / 1000) * avg;
}
