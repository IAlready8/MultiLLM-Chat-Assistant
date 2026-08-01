import { describe, expect, it } from 'vitest'
import { resolveAuthCallbackUrl } from '@/lib/auth-redirect'

describe('resolveAuthCallbackUrl', () => {
  it.each([undefined, null, '', 'https://evil.example', '//evil.example']) (
    'falls back to the workspace root for unsafe callback %s',
    (value) => {
      expect(resolveAuthCallbackUrl(value)).toBe('/')
    },
  )

  it('preserves a local callback path and query', () => {
    expect(resolveAuthCallbackUrl('/settings?tab=providers')).toBe(
      '/settings?tab=providers',
    )
  })
})
