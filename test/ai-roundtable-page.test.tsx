import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@/test/test-utils'
import AIRoundtablePage from '@/app/ai-roundtable/page'

const mockApiClient = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  addMessages: vi.fn(),
  deleteConversation: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}))

const mockFetch = vi.fn()

const roundtableConversation = {
  id: 'roundtable-1',
  title: 'Roundtable: Old test chat',
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}

describe('AIRoundtablePage history behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ configuredProviders: ['openai', 'anthropic'] }),
    })
    vi.stubGlobal('fetch', mockFetch)
    mockApiClient.getConversations.mockResolvedValue([
      roundtableConversation,
      {
        id: 'chat-1',
        title: 'Regular chat',
        userId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ])
    mockApiClient.getConversation.mockResolvedValue({
      ...roundtableConversation,
      messages: [
        {
          id: 'msg-goal',
          role: 'user',
          content: 'Goal: Old persisted goal',
          provider: null,
          model: null,
          conversationId: 'roundtable-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'msg-agent',
          role: 'assistant',
          content: 'Agent 1: Old persisted response',
          provider: 'openai',
          model: 'gpt-4',
          conversationId: 'roundtable-1',
          createdAt: new Date('2026-01-01T00:01:00.000Z'),
        },
      ],
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads Roundtable history without hydrating the newest thread as current', async () => {
    render(<AIRoundtablePage />)

    await screen.findByText('Roundtable: Old test chat')

    expect(mockApiClient.getConversations).toHaveBeenCalledTimes(1)
    expect(mockApiClient.getConversation).not.toHaveBeenCalled()
    expect(
      screen.getByText('Add a goal and start the roundtable to watch agents converse.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Old persisted response')).not.toBeInTheDocument()
  })

  it('hydrates a saved Roundtable only after the user clicks a history item', async () => {
    const user = userEvent.setup()
    render(<AIRoundtablePage />)

    const historyTitle = await screen.findByText('Roundtable: Old test chat')
    const historyButton = historyTitle.closest('button')
    expect(historyButton).not.toBeNull()

    await user.click(historyButton!)

    expect(await screen.findAllByText('Old persisted goal')).toHaveLength(2)
    expect(screen.getByText('Old persisted response')).toBeInTheDocument()
    expect(mockApiClient.getConversation).toHaveBeenCalledWith('roundtable-1')

    await waitFor(() => {
      expect(
        screen.getByText('Roundtable: Old test chat').closest('button')?.parentElement?.className
      ).toContain('border-primary')
    })
  })

  it('New Thread clears the current draft instead of reloading history', async () => {
    const user = userEvent.setup()
    render(<AIRoundtablePage />)

    await screen.findByText('Roundtable: Old test chat')
    const goalInput = screen.getByPlaceholderText(
      'Describe the objective for the AI conversation...'
    )
    await user.type(goalInput, 'Draft goal')
    expect(goalInput).toHaveValue('Draft goal')

    await user.click(screen.getByRole('button', { name: /new thread/i }))

    expect(goalInput).toHaveValue('')
    expect(mockApiClient.getConversation).not.toHaveBeenCalled()
    expect(screen.getByText('Roundtable: Old test chat')).toBeInTheDocument()
  })
})
