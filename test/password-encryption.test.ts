// @vitest-environment node
import { createCipheriv, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('portable password encryption', () => {
  it.each(['node', 'webcrypto'])('round trips Unicode using salted password derivation in %s', async mode => {
    vi.resetModules()
    if (mode === 'webcrypto') vi.stubGlobal('window', {})
    const { encrypt, decrypt } = await import('@/lib/crypto')
    const password = 'A long secret passphrase 🌍'
    const ciphertext = await encrypt('Saved discussion: 你好', password)
    expect(ciphertext).toMatch(/^v3:pbkdf2:/)
    expect(await decrypt(ciphertext, password)).toBe('Saved discussion: 你好')
    expect(await encrypt('Saved discussion: 你好', password)).not.toBe(ciphertext)
    await expect(decrypt(ciphertext, password + 'wrong')).rejects.toThrow(/decrypt/)
  })

  it('can still read a legacy file without producing more weak exports', async () => {
    const password = 'legacy-password'
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(password.padEnd(32, '0')), iv)
    const content = Buffer.concat([cipher.update('legacy conversation', 'utf8'), cipher.final()])
    const oldFile = Buffer.concat([iv, content, cipher.getAuthTag()]).toString('base64')
    const { decrypt } = await import('@/lib/crypto')
    expect(await decrypt(oldFile, password)).toBe('legacy conversation')
  })

  it('rejects malformed salt and tampered ciphertext', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto')
    const encrypted = await encrypt('Private content', 'a-long-passphrase')
    await expect(decrypt(encrypted.replace(/pbkdf2:[^:]+/, 'pbkdf2:AA=='), 'a-long-passphrase')).rejects.toThrow(/decrypt/)
    const parts = encrypted.split(':')
    const data = Buffer.from(parts[5], 'base64')
    data[15] ^= 1
    parts[5] = data.toString('base64')
    await expect(decrypt(parts.join(':'), 'a-long-passphrase')).rejects.toThrow(/decrypt/)
  })
})
