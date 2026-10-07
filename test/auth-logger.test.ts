import { afterEach, describe, expect, it, vi } from 'vitest'
import { authLogger } from '@/lib/auth-logger'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('NextAuth diagnostic privacy', () => {
  it('keeps framework error codes while excluding arbitrary OAuth metadata', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    authLogger.error?.('OAUTH_CALLBACK_ERROR', {
      error: new Error('token=private-token'),
      value: 'private-state',
      profile: { email: 'private-email' },
      code: 'private-code',
    })
    expect(JSON.stringify(log.mock.calls)).toContain('OAUTH_CALLBACK_ERROR')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-')
  })

  it('never logs raw CREATE_STATE/PKCE values even in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    authLogger.debug?.('CREATE_STATE', { value: 'private-state', maxAge: 900 })
    expect(debug).toHaveBeenCalledWith('[next-auth][debug][CREATE_STATE]')
    vi.stubEnv('NODE_ENV', 'production')
    authLogger.debug?.('CREATE_PKCECODEVERIFIER', { value: 'private-verifier' })
    expect(debug).toHaveBeenCalledOnce()
  })
})
