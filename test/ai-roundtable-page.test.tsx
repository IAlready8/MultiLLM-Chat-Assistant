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

const createStreamResponse = (text: string) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    }),
    { status: 200 }
  )

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

  it('offers every catalog-backed provider and recent OpenAI/Anthropic models', async () => {
    const user = userEvent.setup()
    render(<AIRoundtablePage />)

    expect(
      await screen.findByRole('button', { name: /Ollama \(local\)/i })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Mistral/i })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Kimi \(Moonshot AI\)/i })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /DeepSeek/i })).toBeVisible()
    expect(screen.getByRole('option', { name: 'GPT-5.6 Sol' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Claude \(Anthropic\)/i }))
    expect(
      screen.getAllByRole('option', { name: 'Claude Fable 5' }).length,
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Mistral/i }))
    expect(screen.getByRole('option', { name: 'Mistral Large' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Ollama \(local\)/i }))
    expect(screen.getByRole('option', { name: 'Llama 3 (8B)' })).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: /Kimi \(Moonshot AI\)/i })
    )
    expect(screen.getByRole('option', { name: 'Kimi K3' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /DeepSeek/i }))
    expect(
      screen.getByRole('option', { name: 'DeepSeek V4 Flash 0731 — Free Community' })
    ).toBeVisible()
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

  it('archives a completed roundtable and clears the active transcript', async () => {
    const user = userEvent.setup()
    const newConversation = {
      id: 'roundtable-new',
      title: 'Roundtable: New archived goal',
      userId: 'user-1',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:01:00.000Z'),
    }

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/llm/chat')) {
        return createStreamResponse('Archived response')
      }

      return {
        ok: true,
        json: async () => ({ configuredProviders: ['openai', 'anthropic'] }),
      } as Response
    })
    mockApiClient.createConversation.mockResolvedValue(newConversation)
    mockApiClient.addMessages.mockResolvedValue({})
    mockApiClient.getConversations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([newConversation])

    render(<AIRoundtablePage />)

    const goalInput = screen.getByPlaceholderText(
      'Describe the objective for the AI conversation...'
    )
    const turnsInput = screen.getByDisplayValue('6')
    await user.type(goalInput, 'New archived goal')
    await user.clear(turnsInput)
    await user.type(turnsInput, '2')
    await user.click(screen.getByRole('button', { name: /^start$/i }))

    expect(await screen.findByText('Roundtable saved to history.')).toBeInTheDocument()
    expect(goalInput).toHaveValue('')
    expect(
      screen.getByText('Add a goal and start the roundtable to watch agents converse.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Archived response')).not.toBeInTheDocument()
    expect(await screen.findByText('Roundtable: New archived goal')).toBeInTheDocument()
    expect(
      screen.getByText('Roundtable: New archived goal').closest('button')?.parentElement?.className
    ).not.toContain('border-primary')
  }, 10_000)
})
