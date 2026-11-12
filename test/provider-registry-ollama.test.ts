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
    expect(registry.getProviderDisabledMessage('ollama')).toBe(
      'Ollama is only available when the app runs locally.',
    )
  })

  it('stays available outside production for local use', async () => {
    for (const env of ['development', 'test']) {
      const registry = await load(env)
      expect(registry.isProviderOperational('ollama')).toBe(true)
      expect(registry.supportedProviderIds).toContain('ollama')
    }
  })

  it('leaves hosted providers and the DeepSeek block unchanged in production', async () => {
    const registry = await load('production')
    for (const id of ['openai', 'openrouter', 'anthropic', 'googleai', 'grok', 'mistral', 'kimi']) {
      expect(registry.isProviderOperational(id)).toBe(true)
    }
    expect(registry.isProviderOperational('deepseek')).toBe(false)
  })

  it('agrees with the endpoint policy that rejects Ollama in production', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    const { getProviderBaseUrl } = await import('@/lib/provider-endpoint')
    expect(() => getProviderBaseUrl('ollama', undefined)).toThrow()
  })
})
