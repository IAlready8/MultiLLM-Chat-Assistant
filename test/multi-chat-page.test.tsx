import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '@/test/test-utils'
import MultiChatPage from '@/app/multi-chat/page'

const mockApiClient = vi.hoisted(() => ({
  getConversations: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}))

describe('MultiChatPage provider model picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockApiClient.getConversations.mockResolvedValue([])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ configuredProviders: [] }),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers every catalog-backed provider, including Ollama, Mistral, and Kimi', async () => {
    const user = userEvent.setup()
    render(<MultiChatPage />)

    expect(
      await screen.findByRole('button', { name: /Ollama \(local\)/i })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Mistral/i })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Kimi \(Moonshot AI\)/i })
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Mistral/i }))
    expect(screen.getByRole('option', { name: 'Mistral Large' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Ollama \(local\)/i }))
    expect(screen.getByRole('option', { name: 'Llama 3 (8B)' })).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: /Kimi \(Moonshot AI\)/i })
    )
    expect(screen.getByRole('option', { name: 'Kimi K3' })).toBeVisible()
  })
})
