import { describe, expect, it, vi } from 'vitest'

import {
  fetchAndVerifyAuthProvider,
  fetchAndVerifyGoogleAuthorization,
  verifyGoogleAuthorizationUrl,
  normalizeProviderId,
  verifyAuthProviderPayload,
} from '../scripts/auth-provider-guard.mjs'

const BASE_URL = 'https://multi-llm-chat-assistant.vercel.app'
const providerPayload = {
  google: {
    id: 'google',
    name: 'Google',
    type: 'oauth',
    signinUrl: `${BASE_URL}/api/auth/signin/google`,
    callbackUrl: `${BASE_URL}/api/auth/callback/google`,
  },
  credentials: {
    id: 'credentials',
    name: 'Email and password',
    type: 'credentials',
    signinUrl: `${BASE_URL}/api/auth/signin/credentials`,
    callbackUrl: `${BASE_URL}/api/auth/callback/credentials`,
  },
}

const authorizationUrl = (changes = {}) => {
  const params = new URLSearchParams({
    client_id: 'test-client',
    redirect_uri: `${BASE_URL}/api/auth/callback/google`,
    response_type: 'code', state: 'private-state',
    code_challenge_method: 'S256', code_challenge: 'private-challenge',
    ...changes,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

describe('actual Google authorization guard', () => {
  it('verifies callback, state and PKCE without returning authorization material', () => {
    expect(verifyGoogleAuthorizationUrl(authorizationUrl(), BASE_URL)).toEqual({
      authorizationOrigin: 'https://accounts.google.com',
      callbackUrl: `${BASE_URL}/api/auth/callback/google`,
    })
  })

  it.each([
    ['redirect_uri', 'https://preview.example/api/auth/callback/google'],
    ['response_type', 'token'], ['state', ''], ['client_id', ''],
    ['code_challenge_method', 'plain'], ['code_challenge', ''],
  ])('rejects an invalid %s', (key, value) => {
    expect(() => verifyGoogleAuthorizationUrl(authorizationUrl({ [key]: value }), BASE_URL)).toThrow()
  })

  it('rejects unexpected origins, duplicate redirects and malformed URLs without leaking them', () => {
    for (const value of [
      'private-invalid-url',
      authorizationUrl().replace('accounts.google.com', 'accounts.google.com.attacker.test'),
      `${authorizationUrl()}&redirect_uri=${BASE_URL}/api/auth/callback/google`,
    ]) {
      try {
        verifyGoogleAuthorizationUrl(value, BASE_URL)
        expect.fail('must reject')
      } catch (error) {
        expect(error.message).not.toContain('private-')
        expect(error.message).not.toContain('test-client')
      }
    }
  })

  const csrfResponse = () => {
    const response = new Response(JSON.stringify({ csrfToken: 'test-csrf' }))
    response.headers.getSetCookie = () => [
      '__Host-next-auth.csrf-token=test-cookie; Path=/; HttpOnly; Secure',
      'unrelated=do-not-forward; Path=/',
    ]
    return response
  }

  it('performs the CSRF handshake and confines cookies to same-origin requests', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(csrfResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: authorizationUrl() })))
    await expect(fetchAndVerifyGoogleAuthorization({ baseUrl: BASE_URL, fetchImpl })).resolves.toMatchObject({
      callbackUrl: `${BASE_URL}/api/auth/callback/google`,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenLastCalledWith(`${BASE_URL}/api/auth/signin/google`, expect.objectContaining({
      method: 'POST', redirect: 'error',
      headers: expect.objectContaining({ cookie: '__Host-next-auth.csrf-token=test-cookie' }),
      body: expect.stringContaining('csrfToken=test-csrf'),
    }))
  })

  it('rejects missing cookies, bad tokens, HTTP errors and invalid JSON', async () => {
    for (const response of [
      new Response('{}'),
      new Response(JSON.stringify({ csrfToken: 'test-csrf' })),
      new Response('unavailable', { status: 503 }),
      new Response('secret-invalid-json'),
    ]) {
      await expect(fetchAndVerifyGoogleAuthorization({
        baseUrl: BASE_URL, fetchImpl: vi.fn().mockResolvedValue(response),
      })).rejects.toThrow(/^(Google|Auth) /)
    }
  })

  it('does not expose transport errors or redirect response bodies', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(csrfResponse())
      .mockRejectedValueOnce(new Error('private-state private-cookie'))
    await expect(fetchAndVerifyGoogleAuthorization({ baseUrl: BASE_URL, fetchImpl }))
      .rejects.toThrow('failed before a valid response')
  })

  it('aborts a stuck authorization request', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn().mockResolvedValueOnce(csrfResponse())
        .mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }))
      const pending = expect(fetchAndVerifyGoogleAuthorization({ baseUrl: BASE_URL, timeoutMs: 1000, fetchImpl }))
        .rejects.toThrow('timed out after 1000')
      await vi.advanceTimersByTimeAsync(1000)
      await pending
    } finally { vi.useRealTimers() }
  })
})

describe('production auth provider guard', () => {
  it('accepts bounded lowercase provider IDs', () => {
    expect(normalizeProviderId('google')).toBe('google')
    expect(normalizeProviderId('custom_oauth-2')).toBe('custom_oauth-2')
    expect(() => normalizeProviderId('Google')).toThrow('lowercase letters')
    expect(() => normalizeProviderId('')).toThrow('lowercase letters')
    expect(() => normalizeProviderId(`p${'a'.repeat(64)}`)).toThrow(
      'lowercase letters'
    )
  })

  it('requires the provider to exist and use the OAuth type', () => {
    expect(
      verifyAuthProviderPayload(providerPayload, {
        baseUrl: `${BASE_URL}/`,
        providerId: 'google',
      })
    ).toEqual({
      callbackUrl: `${BASE_URL}/api/auth/callback/google`,
      name: 'Google',
      providerId: 'google',
      signinUrl: `${BASE_URL}/api/auth/signin/google`,
    })

    expect(() =>
      verifyAuthProviderPayload(providerPayload, {
        baseUrl: BASE_URL,
        providerId: 'github',
      })
    ).toThrow('Required OAuth provider is not configured: github')

    expect(() =>
      verifyAuthProviderPayload(providerPayload, {
        baseUrl: BASE_URL,
        providerId: 'credentials',
      })
    ).toThrow('not exposed as the expected OAuth provider')
  })

  it('rejects a callback URL derived from a different deployment', () => {
    expect(() =>
      verifyAuthProviderPayload(
        {
          google: {
            ...providerPayload.google,
            callbackUrl:
              'https://preview.example.com/api/auth/callback/google',
          },
        },
        { baseUrl: BASE_URL, providerId: 'google' }
      )
    ).toThrow('callback URL mismatch')
  })

  it('rejects a sign-in URL derived from a different deployment', () => {
    expect(() =>
      verifyAuthProviderPayload(
        {
          google: {
            ...providerPayload.google,
            signinUrl: 'https://preview.example.com/api/auth/signin/google',
          },
        },
        { baseUrl: BASE_URL, providerId: 'google' }
      )
    ).toThrow('sign-in URL mismatch')
  })

  it('checks HTTP status and JSON before accepting provider discovery', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(providerPayload), { status: 200 })
    )

    await expect(
      fetchAndVerifyAuthProvider({
        baseUrl: `${BASE_URL}/`,
        providerId: 'google',
        fetchImpl,
      })
    ).resolves.toEqual({
      callbackUrl: `${BASE_URL}/api/auth/callback/google`,
      name: 'Google',
      providerId: 'google',
      signinUrl: `${BASE_URL}/api/auth/signin/google`,
      url: `${BASE_URL}/api/auth/providers`,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/api/auth/providers`,
      expect.objectContaining({ redirect: 'error' })
    )

    await expect(
      fetchAndVerifyAuthProvider({
        baseUrl: BASE_URL,
        providerId: 'google',
        fetchImpl: vi.fn().mockResolvedValue(
          new Response('unavailable', { status: 503 })
        ),
      })
    ).rejects.toThrow('HTTP 503')

    await expect(
      fetchAndVerifyAuthProvider({
        baseUrl: BASE_URL,
        providerId: 'google',
        fetchImpl: vi.fn().mockResolvedValue(
          new Response('not-json', { status: 200 })
        ),
      })
    ).rejects.toThrow('did not return valid JSON')
  })

  it('rejects redirects and invalid provider payloads', async () => {
    await expect(
      fetchAndVerifyAuthProvider({
        baseUrl: BASE_URL,
        providerId: 'google',
        fetchImpl: vi.fn().mockResolvedValue(new Response('', { status: 302 })),
      })
    ).rejects.toThrow('HTTP 302')

    await expect(
      fetchAndVerifyAuthProvider({
        baseUrl: BASE_URL,
        providerId: 'google',
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify([]), { status: 200 })
        ),
      })
    ).rejects.toThrow('did not return a provider object')
  })

  it('fails with a bounded timeout', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      )

      const verification = fetchAndVerifyAuthProvider({
        baseUrl: BASE_URL,
        providerId: 'google',
        timeoutMs: 1000,
        fetchImpl,
      })
      const expectation = expect(verification).rejects.toThrow(
        'timed out after 1000 milliseconds'
      )
      await vi.advanceTimersByTimeAsync(1000)
      await expectation
    } finally {
      vi.useRealTimers()
    }
  })
})
