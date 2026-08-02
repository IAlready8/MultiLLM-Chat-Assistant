import { describe, expect, it, vi } from 'vitest'

import {
  fetchAndVerifyAuthProvider,
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
