import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
const originalAuthRequireLogin = process.env.AUTH_REQUIRE_LOGIN
const originalPublicAuthRequireLogin = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN
const originalDemoEnabled = process.env.DEMO_ACCOUNT_ENABLED
const originalDemoBypass = process.env.DEMO_ACCOUNT_BYPASS_AUTH

const setEnvVar = (key: string, value: string | undefined) => {
  const env = process.env as Record<string, string | undefined>
  if (value === undefined) {
    delete env[key]
  } else {
    env[key] = value
  }
}

const loadModule = async () => {
  vi.resetModules()
  return await import('@/lib/demo-account')
}

describe('demo-account runtime auth behavior', () => {
  beforeEach(() => {
    setEnvVar('NODE_ENV', 'test')
    setEnvVar('AUTH_REQUIRE_LOGIN', undefined)
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', undefined)
    setEnvVar('DEMO_ACCOUNT_ENABLED', undefined)
    setEnvVar('DEMO_ACCOUNT_BYPASS_AUTH', undefined)
  })

  afterEach(() => {
    setEnvVar('NODE_ENV', originalNodeEnv)
    setEnvVar('AUTH_REQUIRE_LOGIN', originalAuthRequireLogin)
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', originalPublicAuthRequireLogin)
    setEnvVar('DEMO_ACCOUNT_ENABLED', originalDemoEnabled)
    setEnvVar('DEMO_ACCOUNT_BYPASS_AUTH', originalDemoBypass)
  })

  it('does not require strict auth by default outside production', async () => {
    const mod = await loadModule()
    expect(mod.isStrictAuthRequired()).toBe(false)
  })

  it('requires strict auth in production regardless of strict flags', async () => {
    setEnvVar('NODE_ENV', 'production')
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')

    const mod = await loadModule()
    expect(mod.isStrictAuthRequired()).toBe(true)
  })

  it('disables demo and bypass in production even when env enables them', async () => {
    setEnvVar('NODE_ENV', 'production')
    setEnvVar('DEMO_ACCOUNT_ENABLED', 'true')
    setEnvVar('DEMO_ACCOUNT_BYPASS_AUTH', 'true')

    const mod = await loadModule()
    const context = mod.getDemoAccountContext()

    expect(context.enabled).toBe(false)
    expect(context.bypassAuth).toBe(false)
  })

  it('allows in-memory auth fallback only outside strict non-production mode', async () => {
    setEnvVar('NODE_ENV', 'test')
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')
    let mod = await loadModule()
    expect(mod.isInMemoryAuthFallbackAllowed()).toBe(true)

    setEnvVar('AUTH_REQUIRE_LOGIN', 'true')
    mod = await loadModule()
    expect(mod.isInMemoryAuthFallbackAllowed()).toBe(false)

    setEnvVar('NODE_ENV', 'production')
    setEnvVar('AUTH_REQUIRE_LOGIN', 'false')
    setEnvVar('NEXT_PUBLIC_AUTH_REQUIRE_LOGIN', 'false')
    mod = await loadModule()
    expect(mod.isInMemoryAuthFallbackAllowed()).toBe(false)
  })
})
