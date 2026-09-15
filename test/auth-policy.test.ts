import { afterEach, describe, expect, it } from 'vitest'
import {
  getOAuthConfiguration,
  isStrictAuthRequired,
} from '@/lib/auth-policy'

const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID
const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const originalGitHubClientId = process.env.GITHUB_CLIENT_ID
const originalGitHubClientSecret = process.env.GITHUB_CLIENT_SECRET
const originalAuthRequireLogin = process.env.AUTH_REQUIRE_LOGIN
const originalPublicAuthRequireLogin = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN

const setEnvVar = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  setEnvVar('GOOGLE_CLIENT_ID', originalGoogleClientId)
  setEnvVar('GOOGLE_CLIENT_SECRET', originalGoogleClientSecret)
  setEnvVar('GITHUB_CLIENT_ID', originalGitHubClientId)
  setEnvVar('GITHUB_CLIENT_SECRET', originalGitHubClientSecret)
  setEnvVar('AUTH_REQUIRE_LOGIN', originalAuthRequireLogin)
  setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', originalPublicAuthRequireLogin)
})

describe('authentication policy', () => {
  it('always requires a real authenticated session', () => {
    process.env.AUTH_REQUIRE_LOGIN = 'false'
    process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN = 'false'

    expect(isStrictAuthRequired()).toBe(true)
  })

  it('only enables an OAuth provider when both credentials exist', () => {
    setEnvVar('GOOGLE_CLIENT_ID', 'google-id')
    setEnvVar('GOOGLE_CLIENT_SECRET', undefined)
    setEnvVar('GITHUB_CLIENT_ID', 'github-id')
    setEnvVar('GITHUB_CLIENT_SECRET', 'github-secret')

    expect(getOAuthConfiguration()).toEqual({
      google: false,
      github: true,
      any: true,
    })
  })

  it('reports account creation unavailable without configured OAuth', () => {
    setEnvVar('GOOGLE_CLIENT_ID', undefined)
    setEnvVar('GOOGLE_CLIENT_SECRET', undefined)
    setEnvVar('GITHUB_CLIENT_ID', undefined)
    setEnvVar('GITHUB_CLIENT_SECRET', undefined)

    expect(getOAuthConfiguration()).toEqual({
      google: false,
      github: false,
      any: false,
    })
  })
})
