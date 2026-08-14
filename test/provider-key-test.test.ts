import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  testProviderKey,
  validateApiKeyFormat,
} from '@/lib/provider-key-test'

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

  describe('kimi', () => {
    it('accepts opaque keys without assuming an undocumented prefix', () => {
      expect(
        validateApiKeyFormat('kimi', 'moonshot-test-key-12345')
      ).toBeNull()
    })
  })

  describe('deepseek', () => {
    it('reports the provider as unavailable instead of requesting a credential', () => {
      expect(validateApiKeyFormat('deepseek', '')).toBe(
        'DeepSeek is currently unavailable.',
      )
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

describe('testProviderKey', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the configured local Ollama endpoint for the connection probe', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))

    const response = await testProviderKey('ollama', '', {
      baseUrl: 'http://127.0.0.2:11434',
    })

    expect(response).toMatchObject({ status: 200 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.2:11434/api/tags',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('does not contact the retired DeepSeek endpoint', async () => {
    const fetchMock = vi.mocked(global.fetch)

    await expect(testProviderKey('deepseek', '')).rejects.toThrow(
      'DeepSeek is currently unavailable.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
