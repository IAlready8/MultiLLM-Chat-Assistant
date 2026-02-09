import { describe, it, expect } from 'vitest'
import { validateApiKeyFormat } from '@/lib/provider-key-test'

describe('validateApiKeyFormat', () => {
  it('rejects keys shorter than 10 characters', () => {
    expect(validateApiKeyFormat('openai', 'sk-abc')).toBe(
      'API key is too short.'
    )
  })

  it('rejects empty keys', () => {
    expect(validateApiKeyFormat('openai', '')).toBe('API key is too short.')
  })

  describe('openai', () => {
    it('accepts keys starting with sk-', () => {
      expect(
        validateApiKeyFormat('openai', 'sk-abcdefghij1234567890')
      ).toBeNull()
    })

    it('rejects keys not starting with sk-', () => {
      expect(
        validateApiKeyFormat('openai', 'bad-key-format-12345')
      ).toContain('sk-')
    })
  })

  describe('openrouter', () => {
    it('accepts keys starting with sk-or-', () => {
      expect(
        validateApiKeyFormat('openrouter', 'sk-or-abcdefghij123456')
      ).toBeNull()
    })

    it('rejects keys not starting with sk-or-', () => {
      expect(
        validateApiKeyFormat('openrouter', 'sk-abcdefghij12345678')
      ).toContain('sk-or-')
    })
  })

  describe('anthropic', () => {
    it('accepts keys starting with sk-ant-', () => {
      expect(
        validateApiKeyFormat('anthropic', 'sk-ant-abcdefghij123')
      ).toBeNull()
    })

    it('rejects keys not starting with sk-ant-', () => {
      expect(
        validateApiKeyFormat('anthropic', 'sk-abcdefghij12345678')
      ).toContain('sk-ant-')
    })
  })

  describe('googleai', () => {
    it('accepts keys starting with AIza', () => {
      expect(
        validateApiKeyFormat('googleai', 'AIzaAbcdefghij12345')
      ).toBeNull()
    })

    it('rejects keys not starting with AIza', () => {
      expect(
        validateApiKeyFormat('googleai', 'bad-key-format-12345')
      ).toContain('AIza')
    })
  })

  describe('grok', () => {
    it('accepts any format (no specific prefix required)', () => {
      expect(
        validateApiKeyFormat('grok', 'xai-abcdefghij1234567890')
      ).toBeNull()
    })
  })

  describe('unknown providers', () => {
    it('accepts any format for unknown providers', () => {
      expect(
        validateApiKeyFormat('some-future-provider', 'any-key-format-123')
      ).toBeNull()
    })
  })
})
