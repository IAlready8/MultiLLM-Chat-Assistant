import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import AIRoundtablePage from '@/app/ai-roundtable/page'

const { mockApiClient, mockToast } = vi.hoisted(() => ({
  mockApiClient: {
    getConversations: vi.fn(),
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    addMessages: vi.fn(),
    deleteConversation: vi.fn(),
  },
  mockToast: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

const roundtableConversation = {
  id: 'roundtable-1',
  title: 'Roundtable: Old Test',
  userId: 'user-1',
  createdAt: new Date('2026-05-01T12:00:00.000Z'),
  updatedAt: new Date('2026-05-01T12:00:00.000Z'),
}

const savedRoundtableWithMessages = {
  ...roundtableConversation,
  messages: [
    {
      id: 'message-goal',
      conversationId: 'roundtable-1',
      role: 'user',
      content: 'Goal: Old deployment test',
      provider: null,
      model: null,
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
    },
    {
      id: 'message-agent',
      conversationId: 'roundtable-1',
      role: 'assistant',
      content: 'Agent 1: This is the saved answer.',
      provider: 'openai',
      model: 'gpt-4o',
      createdAt: new Date('2026-05-01T12:01:00.000Z'),
    },
  ],
}

describe('AIRoundtablePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ configuredProviders: ['openai', 'anthropic'] }),
      })
    )
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    mockApiClient.getConversations.mockResolvedValue([roundtableConversation])
    mockApiClient.getConversation.mockResolvedValue(savedRoundtableWithMessages)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads roundtable history without auto-opening the newest saved thread', async () => {
    render(<AIRoundtablePage />)

    expect(await screen.findByText('Roundtable: Old Test')).toBeInTheDocument()
    expect(mockApiClient.getConversations).toHaveBeenCalledTimes(1)
    expect(mockApiClient.getConversation).not.toHaveBeenCalled()
    expect(
      screen.getByText('Add a goal and start the roundtable to watch agents converse.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Old deployment test')).not.toBeInTheDocument()
    expect(screen.queryByText('Loaded roundtable conversation.')).not.toBeInTheDocument()
  })

  it('opens a saved roundtable only after the user selects it from history', async () => {
    const user = userEvent.setup()
    render(<AIRoundtablePage />)

    await user.click(await screen.findByText('Roundtable: Old Test'))

    await waitFor(() => {
      expect(mockApiClient.getConversation).toHaveBeenCalledWith('roundtable-1')
    })
    expect(await screen.findAllByText('Old deployment test')).toHaveLength(2)
    expect(screen.getByText('This is the saved answer.')).toBeInTheDocument()
    expect(screen.getByText('Loaded roundtable conversation.')).toBeInTheDocument()
  })
})
