/**
 * Provider runtime contract parity tests.
 *
 * Verifies that:
 * 1. classifyProviderError produces consistent codes for all error categories
 * 2. Chat and stream routes return identical error codes for identical failures
 * 3. Provider unsupported / not-configured / auth / rate-limit scenarios
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyProviderError } from '@/lib/providers/errors'
import { ProviderEndpointError } from '@/lib/provider-endpoint'
import { ollamaAdapter } from '@/lib/providers/ollama'
import { getProviderAdapter, supportedProviderIds } from '@/lib/providers/registry'

// ---------------------------------------------------------------------------
// 1. classifyProviderError unit tests
// ---------------------------------------------------------------------------

describe('classifyProviderError', () => {
  it('classifies provider SyntaxError as PROVIDER_MALFORMED_RESPONSE (502)', () => {
    const result = classifyProviderError(new SyntaxError('Unexpected token'))
    expect(result).toEqual({
      status: 502,
      code: 'PROVIDER_MALFORMED_RESPONSE',
      error: 'Provider returned malformed response',
    })
  })

  it('classifies upstream 401 as PROVIDER_AUTH_ERROR (401)', () => {
    const result = classifyProviderError(new Error('HTTP 401: Unauthorized'))
    expect(result).toEqual({
      status: 401,
      code: 'PROVIDER_AUTH_ERROR',
      error: 'Provider rejected the configured API key',
    })
  })

  it('classifies upstream 403 as PROVIDER_AUTH_ERROR (401)', () => {
    const result = classifyProviderError(new Error('HTTP 403: Forbidden'))
    expect(result).toEqual({
      status: 401,
      code: 'PROVIDER_AUTH_ERROR',
      error: 'Provider rejected the configured API key',
    })
  })

  it('classifies upstream 429 as RATE_LIMITED (429)', () => {
    const result = classifyProviderError(new Error('HTTP 429: Too many requests'))
    expect(result).toEqual({
      status: 429,
      code: 'RATE_LIMITED',
      error: 'Provider rate limit reached, please retry shortly',
    })
  })

  it('classifies upstream 500 as PROVIDER_UNAVAILABLE (503)', () => {
    const result = classifyProviderError(new Error('HTTP 500: Internal Server Error'))
    expect(result).toEqual({
      status: 503,
      code: 'PROVIDER_UNAVAILABLE',
      error: 'Provider is currently unavailable',
    })
  })

  it('classifies upstream 502 as PROVIDER_UNAVAILABLE (503)', () => {
    const result = classifyProviderError(new Error('HTTP 502: Bad Gateway'))
    expect(result).toEqual({
      status: 503,
      code: 'PROVIDER_UNAVAILABLE',
      error: 'Provider is currently unavailable',
    })
  })

  it('classifies timeout errors as PROVIDER_TIMEOUT (504)', () => {
    const result = classifyProviderError(new Error('The operation was aborted due to timeout'))
    expect(result).toEqual({
      status: 504,
      code: 'PROVIDER_TIMEOUT',
      error: 'Provider request timed out',
    })
  })

  it('classifies abort errors as PROVIDER_TIMEOUT (504)', () => {
    // AbortSignal.timeout throws an error with "abort" in the message
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    const result = classifyProviderError(err)
    expect(result.code).toBe('PROVIDER_TIMEOUT')
    expect(result.status).toBe(504)
  })

  it('classifies network errors as NETWORK_ERROR (503)', () => {
    for (const msg of [
      'fetch failed',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'NetworkError when attempting to fetch resource',
    ]) {
      const result = classifyProviderError(new Error(msg))
      expect(result.code).toBe('NETWORK_ERROR')
      expect(result.status).toBe(503)
    }
  })

  it('classifies upstream 400 as PROVIDER_REQUEST_ERROR (400)', () => {
    const result = classifyProviderError(new Error('HTTP 400: Invalid model'))
    expect(result).toEqual({
      status: 400,
      code: 'PROVIDER_REQUEST_ERROR',
      error: 'HTTP 400: Invalid model',
    })
  })

  it('classifies unknown errors as INTERNAL_ERROR (500)', () => {
    const result = classifyProviderError(new Error('Something went wrong'))
    expect(result).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      error: 'Something went wrong',
    })
  })

  it('handles non-Error thrown values', () => {
    const result = classifyProviderError('raw string')
    expect(result.code).toBe('INTERNAL_ERROR')
    expect(result.status).toBe(500)
  })

  it('precedence: upstream 401 is checked before timeout keywords', () => {
    // Error message that contains both "abort" and an HTTP 401
    const result = classifyProviderError(new Error('HTTP 401: abort this request'))
    expect(result.code).toBe('PROVIDER_AUTH_ERROR')
  })

  it('precedence: upstream 429 is checked before timeout keywords', () => {
    const result = classifyProviderError(new Error('HTTP 429: timed out'))
    expect(result.code).toBe('RATE_LIMITED')
  })

  it('rejects a blocked Ollama base before the adapter network try block', async () => {
    let thrown: unknown
    try {
      await ollamaAdapter.chat(
        {
          messages: [{ role: 'user', content: 'ping' }],
        },
        { apiKey: '', baseUrl: 'http://169.254.169.254:11434' },
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ProviderEndpointError)
    expect(classifyProviderError(thrown)).toEqual({
      status: 400,
      code: 'PROVIDER_ENDPOINT_BLOCKED',
      error: 'Configured provider endpoint is not allowed',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves redirect-blocked errors from the Ollama connection probe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://localhost:11434/api/tags' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      ollamaAdapter.testConnection!({
        apiKey: '',
        baseUrl: 'http://localhost:11434',
      }),
    ).rejects.toBeInstanceOf(ProviderEndpointError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves redirect-blocked errors from the Ollama chat adapter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://localhost:11434/api/chat' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      ollamaAdapter.chat(
        { messages: [{ role: 'user', content: 'ping' }] },
        { apiKey: '', baseUrl: 'http://localhost:11434' },
      ),
    ).rejects.toBeInstanceOf(ProviderEndpointError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves redirect-blocked errors from the Ollama stream adapter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://localhost:11434/api/chat' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const stream = ollamaAdapter.stream(
      { messages: [{ role: 'user', content: 'ping' }] },
      { apiKey: '', baseUrl: 'http://localhost:11434' },
    )
    await expect(stream.next()).rejects.toBeInstanceOf(ProviderEndpointError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 2. Provider registry tests
// ---------------------------------------------------------------------------

describe('provider registry', () => {
  it('exposes all supported providers', () => {
    expect(supportedProviderIds).toEqual(
      expect.arrayContaining([
        'openai',
        'openrouter',
        'anthropic',
        'googleai',
        'grok',
        'ollama',
        'mistral',
        'kimi',
      ]),
    )
    expect(supportedProviderIds).toHaveLength(8)
    expect(getProviderAdapter('deepseek')).toBeUndefined()
  })

  it('returns an adapter for each supported provider', () => {
    for (const id of supportedProviderIds) {
      const adapter = getProviderAdapter(id)
      expect(adapter).toBeDefined()
      expect(adapter!.id).toBe(id)
      expect(typeof adapter!.testConnection).toBe('function')
      expect(typeof adapter!.chat).toBe('function')
      expect(typeof adapter!.stream).toBe('function')
    }
  })

  it('returns undefined for unsupported providers', () => {
    expect(getProviderAdapter('nonexistent')).toBeUndefined()
    expect(getProviderAdapter('')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. Error code parity between chat and stream error classifiers
// ---------------------------------------------------------------------------

describe('error code parity (chat vs stream)', () => {
  // Both routes now use the same classifyProviderError function,
  // so this test verifies the shared function produces consistent results
  // for all error categories that both routes encounter.

  const errorScenarios = [
    { name: 'auth error', error: new Error('HTTP 401: Invalid key'), expectedCode: 'PROVIDER_AUTH_ERROR' },
    { name: 'rate limit', error: new Error('HTTP 429: Too many requests'), expectedCode: 'RATE_LIMITED' },
    { name: 'server error', error: new Error('HTTP 500: Internal error'), expectedCode: 'PROVIDER_UNAVAILABLE' },
    { name: 'timeout', error: new Error('Request timed out'), expectedCode: 'PROVIDER_TIMEOUT' },
    { name: 'network', error: new Error('fetch failed'), expectedCode: 'NETWORK_ERROR' },
    { name: 'bad request', error: new Error('HTTP 400: invalid model'), expectedCode: 'PROVIDER_REQUEST_ERROR' },
    { name: 'unknown', error: new Error('something broke'), expectedCode: 'INTERNAL_ERROR' },
    { name: 'malformed provider payload', error: new SyntaxError('bad json'), expectedCode: 'PROVIDER_MALFORMED_RESPONSE' },
  ]

  for (const scenario of errorScenarios) {
    it(`classifies "${scenario.name}" consistently as ${scenario.expectedCode}`, () => {
      const result = classifyProviderError(scenario.error)
      expect(result.code).toBe(scenario.expectedCode)
    })
  }
})
