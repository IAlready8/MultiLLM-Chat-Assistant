import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAllConversations = vi.fn()
const mockSaveConversation = vi.fn()

vi.mock('@/lib/crypto', () => ({
  encrypt: async (text: string) => `enc:${text}`,
  decrypt: async (text: string) => text.replace(/^enc:/, ''),
}))

vi.mock('@/services/conversation-storage', () => ({
  getAllConversations: () => mockGetAllConversations(),
  saveConversation: (...args: unknown[]) => mockSaveConversation(...args),
}))

import {
  exportAllData,
  importAllData,
} from '@/services/export-import-service'

describe('export-import-service secret handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockGetAllConversations.mockResolvedValue([
      {
        type: 'multi-chat',
        title: 'Saved chat',
        data: { messages: [{ role: 'user', content: 'hello' }] },
      },
    ])
  })

  it('excludes legacy apiKey_* localStorage entries from exports', async () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('modelSettings', JSON.stringify({ model: 'gpt-4o' }))
    localStorage.setItem('apiKey_openai', 'sk-plaintext-legacy-key')

    const exported = await exportAllData('password-123')
    const decoded = JSON.parse(exported.replace(/^enc:/, ''))

    expect(decoded.version).toBe('1.0')
    expect(decoded.conversations).toHaveLength(1)
    expect(decoded.apiKeys).toBeUndefined()
    expect(JSON.stringify(decoded)).not.toContain('sk-plaintext-legacy-key')
  })

  it('does not restore apiKeys from legacy import payloads', async () => {
    const payload = {
      version: '1.0',
      timestamp: Date.now(),
      conversations: [
        {
          type: 'multi-chat',
          title: 'Imported chat',
          data: { messages: [{ role: 'assistant', content: 'hi' }] },
        },
      ],
      settings: {
        theme: 'light',
        apiKey_openai: 'must-not-restore',
        unrecognized: 'must-not-restore',
      },
      apiKeys: {
        apiKey_openai: 'sk-plaintext-legacy-key',
      },
    }

    await importAllData(`enc:${JSON.stringify(payload)}`, 'password-123')

    expect(mockSaveConversation).toHaveBeenCalledWith(
      'multi-chat',
      'Imported chat',
      { messages: [{ role: 'assistant', content: 'hi' }] },
    )
    expect(localStorage.getItem('apiKey_openai') ?? null).toBeNull()
    expect(localStorage.getItem('unrecognized') ?? null).toBeNull()
  })

  it('requires a strong export password and rejects oversized imports before processing', async () => {
    await expect(exportAllData('short')).rejects.toThrow(/12 characters/)
    await expect(importAllData('x'.repeat(7_000_000), 'password-123')).rejects.toThrow(/import/i)
    expect(mockSaveConversation).not.toHaveBeenCalled()
  })
})
