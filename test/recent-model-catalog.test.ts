import { describe, expect, it } from 'vitest'

import { defaultProviderModels } from '@/lib/config-schemas'
import {
  getDefaultModel,
  getModelsForProvider,
} from '@/lib/model-catalog'
import { getContextWindowLimit } from '@/lib/token-counter'

describe('recent provider model catalog', () => {
  it('exposes the GPT-5.6 family without replacing the OpenAI default', () => {
    expect(getModelsForProvider('openai').map((model) => model.id)).toEqual(
      expect.arrayContaining([
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
      ]),
    )
    expect(defaultProviderModels.openai).toEqual(
      expect.arrayContaining([
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
      ]),
    )
    expect(getDefaultModel('openai')).toBe('gpt-4o')
  })

  it('exposes Anthropic current models without replacing the default', () => {
    expect(getModelsForProvider('anthropic').map((model) => model.id)).toEqual(
      expect.arrayContaining([
        'claude-fable-5',
        'claude-opus-5',
        'claude-sonnet-5',
        'claude-haiku-4-5-20251001',
      ]),
    )
    expect(defaultProviderModels.anthropic).toEqual(
      expect.arrayContaining([
        'claude-fable-5',
        'claude-opus-5',
        'claude-sonnet-5',
        'claude-haiku-4-5-20251001',
      ]),
    )
    expect(getDefaultModel('anthropic')).toBe('claude-3-5-sonnet-20241022')
  })

  it('uses the providers published context windows for new models', () => {
    expect(getContextWindowLimit('openai', 'gpt-5.6-sol')).toBe(1_050_000)
    expect(getContextWindowLimit('openai', 'gpt-5.6-terra')).toBe(1_050_000)
    expect(getContextWindowLimit('openai', 'gpt-5.6-luna')).toBe(1_050_000)
    expect(getContextWindowLimit('anthropic', 'claude-fable-5')).toBe(1_000_000)
    expect(getContextWindowLimit('anthropic', 'claude-opus-5')).toBe(1_000_000)
    expect(getContextWindowLimit('anthropic', 'claude-sonnet-5')).toBe(1_000_000)
    expect(
      getContextWindowLimit('anthropic', 'claude-haiku-4-5-20251001'),
    ).toBe(200_000)
  })

  it('exposes the official DeepSeek V4 models and published context window', () => {
    expect(getModelsForProvider('deepseek').map((model) => model.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ])
    expect(defaultProviderModels.deepseek).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ])
    expect(getDefaultModel('deepseek')).toBe('deepseek-v4-flash')
    expect(getContextWindowLimit('deepseek', 'deepseek-v4-flash')).toBe(
      1_000_000,
    )
    expect(getContextWindowLimit('deepseek', 'deepseek-v4-pro')).toBe(
      1_000_000,
    )
  })
})
