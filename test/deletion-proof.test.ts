import { describe, expect, it } from 'vitest'
import { hasRecentOAuthProof } from '@/lib/deletion-proof'

describe('fresh deletion identity proof', () => {
  const now = 1_900_000_000_000
  it('requires recent server-stamped proof from a linked OAuth account', () => {
    expect(hasRecentOAuthProof({ authenticatedAt: now - 1000, authProvider: 'google' }, ['google'], now)).toBe(true)
    expect(hasRecentOAuthProof({ authenticatedAt: now - 301_000, authProvider: 'google' }, ['google'], now)).toBe(false)
    expect(hasRecentOAuthProof({ authenticatedAt: now + 60_000, authProvider: 'google' }, ['google'], now)).toBe(false)
    expect(hasRecentOAuthProof({ authenticatedAt: now, authProvider: 'google' }, ['github'], now)).toBe(false)
    expect(hasRecentOAuthProof({ authenticatedAt: now, authProvider: 'credentials' }, ['credentials'], now)).toBe(false)
    expect(hasRecentOAuthProof({}, ['google'], now)).toBe(false)
  })
})
