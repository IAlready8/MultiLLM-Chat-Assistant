import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProviderBaseUrl,
  isBlockedIp,
  providerFetch,
  ProviderEndpointError,
} from '@/lib/provider-endpoint'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('provider endpoint policy', () => {
  it('uses exact official base URLs for hosted providers', () => {
    expect(getProviderBaseUrl('openai', undefined)).toBe('https://api.openai.com/v1')
    expect(getProviderBaseUrl('openai', 'https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1',
    )

    for (const configured of [
      'https://api.openai.com.evil.example/v1',
      'https://evil.example/api.openai.com/v1',
      'http://api.openai.com/v1',
      'https://api.openai.com:8443/v1',
      'https://api.openai.com/v2',
      'http://127.0.0.1:8080/v1',
      'https://user:pass@api.openai.com/v1',
      'https://api.openai.com/v1#fragment',
      'https://api.openai.com/v1?redirect=http://127.0.0.1',
      42,
      '',
      '   ',
    ]) {
      expect(() => getProviderBaseUrl('openai', configured)).toThrow(
        ProviderEndpointError,
      )
    }

    expect(() => getProviderBaseUrl('unsupported', undefined)).toThrow(
      ProviderEndpointError,
    )
  })

  it('allows only the exact official DeepSeek origin and base path', () => {
    expect(getProviderBaseUrl('deepseek', undefined)).toBe(
      'https://api.deepseek.com',
    )
    expect(getProviderBaseUrl('deepseek', 'https://api.deepseek.com/')).toBe(
      'https://api.deepseek.com',
    )

    for (const configured of [
      'http://api.deepseek.com',
      'https://api.deepseek.com/v1',
      'https://api.deepseek.com.evil.example',
      'https://evil.example/api.deepseek.com',
      'https://api.deepseek.com:8443',
      'https://user:pass@api.deepseek.com',
      'https://api.deepseek.com?target=http://127.0.0.1',
      'https://api.deepseek.com#fragment',
      'https://q5dh1rfszfym23hj.us-east-2.aws.endpoints.huggingface.cloud/v1',
      'http://127.0.0.1:8080',
      'http://169.254.169.254',
    ]) {
      expect(() => getProviderBaseUrl('deepseek', configured)).toThrow(
        ProviderEndpointError,
      )
    }
  })

  it('refuses redirects from the official DeepSeek endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: 'https://api.deepseek.com/models' },
      }),
    )
    const lookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ])

    await expect(
      providerFetch(
        'deepseek',
        'https://api.deepseek.com/models',
        { headers: { Authorization: 'Bearer test-key' } },
        { fetchImpl, lookup },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('allows only the local Ollama endpoint outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')

    for (const configured of [
      undefined,
      'http://localhost:11434',
      'http://localhost:11434/',
      'http://127.0.0.1:11434',
      'http://127.42.0.9:11434',
      'http://[::1]:11434',
    ]) {
      expect(getProviderBaseUrl('ollama', configured)).toMatch(
        /^http:\/\/(localhost|127\.42\.0\.9|127\.0\.0\.1|\[::1\]):11434$/,
      )
    }

    for (const configured of [
      'http://localhost',
      'http://localhost:80',
      'https://localhost:11434',
      'http://10.0.0.1:11434',
      'http://172.16.0.1:11434',
      'http://192.168.1.1:11434',
      'http://169.254.169.254:11434',
      'http://metadata.google.internal:11434',
      'http://ollama.local:11434',
      'https://public-ollama.example.com',
      'http://user:pass@localhost:11434',
      'http://localhost:11434?model=llama3',
      'http://localhost:11434#fragment',
    ]) {
      expect(() => getProviderBaseUrl('ollama', configured)).toThrow(
        ProviderEndpointError,
      )
    }
  })

  it('blocks private, reserved, metadata, and unusual IP forms', () => {
    for (const address of [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '192.0.2.1',
      '198.18.0.1',
      '203.0.113.1',
      '224.0.0.1',
      '::',
      '::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      'fc00::1',
      'fe80::1',
      'fec0::1',
      '64:ff9b::a00:1',
      '64:ff9b:1::1',
      '100::1',
      '100:0:0:1::1',
      '2001:2::1',
      '2001:db8::1',
      '2001:0::1',
      '2002:a00:1::',
      'ff00::1',
    ]) {
      expect(isBlockedIp(address), address).toBe(true)
    }

    expect(isBlockedIp('8.8.8.8')).toBe(false)
    expect(isBlockedIp('1.1.1.1')).toBe(false)
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false)
  })

  it('rejects a DNS result set containing a private address', async () => {
    const fetchImpl = vi.fn()
    const lookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ])

    await expect(
      providerFetch(
        'openai',
        'https://api.openai.com/v1/models',
        {},
        { fetchImpl, lookup },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts a DNS result set containing only public addresses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const lookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ])

    await expect(
      providerFetch(
        'openai',
        'https://api.openai.com/v1/models',
        {},
        { fetchImpl, lookup },
      ),
    ).resolves.toMatchObject({ status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects empty or failed DNS resolution before fetch', async () => {
    for (const lookup of [
      vi.fn().mockResolvedValue([]),
      vi.fn().mockRejectedValue(new Error('resolver unavailable')),
    ]) {
      const fetchImpl = vi.fn()
      await expect(
        providerFetch(
          'openai',
          'https://api.openai.com/v1/models',
          {},
          { fetchImpl, lookup },
        ),
      ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('rejects IPv6 and IPv4-mapped private DNS results before fetch', async () => {
    for (const address of ['fc00::1', '::ffff:10.0.0.1']) {
      const fetchImpl = vi.fn()
      const lookup = vi.fn().mockResolvedValue([{ address, family: 6 }])

      await expect(
        providerFetch(
          'openai',
          'https://api.openai.com/v1/models',
          {},
          { fetchImpl, lookup },
        ),
      ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('rejects an unusual numeric URL encoding of a private address', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const fetchImpl = vi.fn()

    await expect(
      providerFetch(
        'ollama',
        'http://0x0a000001:11434/api/tags',
        {},
        { baseUrl: 'http://0x0a000001:11434', fetchImpl, lookup: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses redirects and validates the redirect target before returning', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://api.openai.com/v1/models' },
      }),
    )
    const lookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ])

    await expect(
      providerFetch(
        'openai',
        'https://api.openai.com/v1/models',
        {},
        { fetchImpl, lookup },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuses every redirect status without making a second request', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(null, {
          status,
          headers: { location: 'https://api.openai.com/v1/models' },
        }),
      )
      const lookup = vi.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ])

      await expect(
        providerFetch(
          'openai',
          'https://api.openai.com/v1/models',
          { headers: { Authorization: 'Bearer test-key' } },
          { fetchImpl, lookup },
        ),
      ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('rejects a redirect to a loopback address', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { location: 'http://127.0.0.1:8080/admin' },
      }),
    )
    const lookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ])

    await expect(
      providerFetch(
        'openai',
        'https://api.openai.com/v1/models',
        {},
        { fetchImpl, lookup },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
  })

  it('rejects cross-origin and malformed redirect locations', async () => {
    for (const location of [
      'http://127.0.0.1:8080/admin',
      'http://[invalid',
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(null, { status: 302, headers: { location } }),
      )
      const lookup = vi.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ])

      await expect(
        providerFetch(
          'openai',
          'https://api.openai.com/v1/models',
          {},
          { fetchImpl, lookup },
        ),
      ).rejects.toMatchObject({ code: 'PROVIDER_ENDPOINT_BLOCKED' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('allows the documented local Ollama endpoint only outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const lookup = vi.fn()

    await expect(
      providerFetch(
        'ollama',
        'http://[::1]:11434/api/tags',
        {},
        { fetchImpl, lookup, baseUrl: 'http://[::1]:11434' },
      ),
    ).resolves.toMatchObject({ status: 200 })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('does not allow user-controlled Ollama endpoints in production-mode deployments', () => {
    vi.stubEnv('NODE_ENV', 'production')

    for (const configured of [
      undefined,
      'http://localhost:11434',
      'http://127.0.0.1:11434',
      'http://[::1]:11434',
      'https://ollama.example.com',
    ]) {
      expect(() => getProviderBaseUrl('ollama', configured)).toThrow(
        ProviderEndpointError,
      )
      expect(() => getProviderBaseUrl('ollama', configured)).toThrow(
        'production-mode deployments',
      )
    }
  })
})
