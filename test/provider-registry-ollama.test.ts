import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async (nodeEnv: string) => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', nodeEnv)
  return import('@/lib/provider-registry')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Ollama availability by environment', () => {
  it('is not offered in production, where its endpoints are always rejected', async () => {
    const registry = await load('production')
    expect(registry.isProviderOperational('ollama')).toBe(false)
    expect(registry.isProviderDisabled('ollama')).toBe(true)
    expect(registry.supportedProviderIds).not.toContain('ollama')
    expect(registry.operationalProviderRegistry.map((p) => p.id)).not.toContain('ollama')
  })

  it('stays available outside production for local use', async () => {
    for (const env of ['development', 'test']) {
      const registry = await load(env)
      expect(registry.isProviderOperational('ollama')).toBe(true)
      expect(registry.supportedProviderIds).toContain('ollama')
    }
  })

  it('limits production to the V1 provider shortlist and keeps DeepSeek blocked', async () => {
    const registry = await load('production')
    expect([...registry.supportedProviderIds].sort()).toEqual(['anthropic', 'googleai', 'openai'])
    for (const id of ['openrouter', 'grok', 'mistral', 'kimi', 'deepseek']) {
      expect(registry.isProviderOperational(id)).toBe(false)
    }
  })

  it('agrees with the endpoint policy that rejects Ollama in production', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    const { getProviderBaseUrl } = await import('@/lib/provider-endpoint')
    expect(() => getProviderBaseUrl('ollama', undefined)).toThrow()
  })
})
