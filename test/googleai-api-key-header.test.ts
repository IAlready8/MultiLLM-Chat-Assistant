// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/provider-endpoint', () => ({
  getProviderBaseUrl: () => 'https://generativelanguage.googleapis.com/v1beta',
  providerFetch: mockFetch,
}))

import { googleaiAdapter } from '@/lib/providers/googleai'
import { testProviderKey } from '@/lib/provider-key-test'

const apiKey = 'AIza-unit-test-key-not-a-real-credential'

describe('Google AI credentials stay in the request headers', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'hello' }] } }],
    }), { status: 200 }))
  })

  it('uses the key header for credential checks', async () => {
    await testProviderKey('googleai', apiKey)
    expect(mockFetch).toHaveBeenCalledOnce()
    const [, url, init] = mockFetch.mock.calls[0]
    expect(url).not.toContain(apiKey)
    expect(url).not.toContain('key=')
    expect(init.headers['x-goog-api-key']).toBe(apiKey)
  })

  it('uses the key header for generation requests', async () => {
    await googleaiAdapter.chat(
      { model: 'gemini-test', messages: [{ role: 'user', content: 'hello' }] },
      { apiKey },
    )
    expect(mockFetch).toHaveBeenCalledOnce()
    const [, url, init] = mockFetch.mock.calls[0]
    expect(url).not.toContain(apiKey)
    expect(url).not.toContain('key=')
    expect(init.headers['x-goog-api-key']).toBe(apiKey)
  })

  it('uses the key header for model discovery', async () => {
    await googleaiAdapter.testConnection?.({ apiKey })
    const [, url, init] = mockFetch.mock.calls[0]
    expect(url).not.toContain(apiKey)
    expect(init.headers['x-goog-api-key']).toBe(apiKey)
  })
})
