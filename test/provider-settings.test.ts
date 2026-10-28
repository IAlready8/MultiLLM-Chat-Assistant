import { describe, expect, it } from 'vitest'
import {
  ProviderSettingsError,
  publicProviderSettings,
  validateProviderSettingsInput,
} from '@/lib/provider-settings'

describe('provider settings secret boundary', () => {
  it.each([
    'apiKey', 'API_KEY', 'X-API-Key', 'authorization', 'Proxy-Authorization',
    'access_token', 'refreshToken', 'clientSecret', 'password', 'private_key',
    'cookies', 'apiKeyEncryptionSeed', 'token', 'credentials',
  ])('removes the %s credential field from legacy objects and arrays', (key) => {
    const input = { metadata: [{ [key]: 'synthetic-credential', label: 'preserved' }] }
    expect(publicProviderSettings(input)).toEqual({ metadata: [{ label: 'preserved' }] })
    expect(input.metadata[0][key]).toBe('synthetic-credential')
  })

  it('preserves token-related non-secret names and long legitimate settings', () => {
    const input = { maxTokens: 4096, tokenizer: 'example', tokenBudget: 8192,
      metadata: [{ label: 'x'.repeat(1000), nullable: null, flags: [true, false, 42] }] }
    expect(publicProviderSettings(input)).toEqual(input)
  })

  it.each([null, undefined, 'not an object', [], 42])('omits malformed legacy settings %#', (input) => {
    expect(publicProviderSettings(input)).toBeUndefined()
  })

  it('bounds legacy traversal without modifying the stored object', () => {
    const input: Record<string, unknown> = {}
    let cursor = input
    for (let index = 0; index < 40; index++) {
      const child = {}
      cursor.child = child
      cursor = child
    }
    cursor.apiKey = 'synthetic-deep-credential'
    const output = publicProviderSettings(input)
    expect(JSON.stringify(output)).not.toContain('synthetic-deep-credential')
    expect(JSON.stringify(output)).toContain('null')
    expect(cursor.apiKey).toBe('synthetic-deep-credential')
    expect(() => validateProviderSettingsInput({ settings: input })).toThrow(ProviderSettingsError)
  })

  it('allows the dedicated credential and safe supported settings only', () => {
    expect(() => validateProviderSettingsInput({ apiKey: 'synthetic-primary-credential',
      models: [], provider: 'openai', isActive: true,
      settings: { maxTokens: 4096, organization: 'org-safe' },
    })).not.toThrow()
    expect(() => validateProviderSettingsInput({ settings: { apiKey: '' } })).toThrow(ProviderSettingsError)
    expect(() => validateProviderSettingsInput({ settings: { customTimeout: 1000 } })).toThrow(ProviderSettingsError)
  })

  it('keeps hostile property names as inert JSON without modifying prototypes', () => {
    const input: unknown = JSON.parse('{"__proto__":{"apiKey":"synthetic-credential","label":"safe"}}')
    const output = publicProviderSettings(input)
    expect(JSON.stringify(output)).toBe('{"__proto__":{"label":"safe"}}')
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype)
    expect({}).not.toHaveProperty('label')
  })
})
