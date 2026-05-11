import { describe, it, expect } from 'vitest'
import {
  providerRegistry,
  supportedProviderIds,
  defaultProviderModels,
  defaultRateLimits,
} from '@/lib/config-schemas'

describe('config-schemas provider registry', () => {
  it('providerRegistry contains all expected providers', () => {
    const ids = providerRegistry.map((p) => p.id)
    expect(ids).toContain('openai')
    expect(ids).toContain('openrouter')
    expect(ids).toContain('anthropic')
    expect(ids).toContain('googleai')
    expect(ids).toContain('grok')
    expect(ids).toContain('ollama')
    expect(ids).toContain('mistral')
  })

  it('providerRegistry entries have required fields', () => {
    for (const provider of providerRegistry) {
      expect(provider.id).toBeTruthy()
      expect(provider.name).toBeTruthy()
      expect(provider.placeholder).toBeTruthy()
    }
  })

  it('supportedProviderIds matches providerRegistry', () => {
    expect(supportedProviderIds).toEqual(providerRegistry.map((p) => p.id))
  })

  it('every provider in registry has default models', () => {
    for (const id of supportedProviderIds) {
      const models =
        defaultProviderModels[id as keyof typeof defaultProviderModels]
      expect(models).toBeDefined()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)
    }
  })

  it('every provider in registry has default rate limits', () => {
    for (const id of supportedProviderIds) {
      const limits =
        defaultRateLimits[id as keyof typeof defaultRateLimits]
      expect(limits).toBeDefined()
      expect(limits.requests).toBeGreaterThan(0)
      expect(limits.window).toBeGreaterThan(0)
    }
  })

  it('provider IDs are unique', () => {
    const ids = providerRegistry.map((p) => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})
