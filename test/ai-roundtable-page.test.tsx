import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { act, render, screen, waitFor } from '@/test/test-utils'
import AIRoundtablePage from '@/app/ai-roundtable/page'

const mockApiClient = vi.hoisted(() => ({
  getConversationPage: vi.fn(),
  getConversationMessages: vi.fn(),
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
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'chunk', content: text }) + '\n' + JSON.stringify({ type: 'done' }) + '\n'))
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
    mockApiClient.getConversationPage.mockResolvedValue({ items: [roundtableConversation], nextCursor: null })
    mockApiClient.getConversationMessages.mockResolvedValue({
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

    expect(mockApiClient.getConversationPage).toHaveBeenCalledWith('roundtable', undefined)
    expect(mockApiClient.getConversationMessages).not.toHaveBeenCalled()
    expect(
      screen.getByText('Add a goal and start the roundtable to watch agents converse.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Old persisted response')).not.toBeInTheDocument()
  })

  it('preserves loaded history when an older page fails and retries the same cursor', async () => {
    const user = userEvent.setup()
    mockApiClient.getConversationPage
      .mockResolvedValueOnce({ items: [roundtableConversation], nextCursor: 'older-page' })
      .mockRejectedValueOnce(new Error('Temporary read failure'))
      .mockResolvedValueOnce({ items: [{ ...roundtableConversation, id: 'older', title: 'Roundtable: Older thread' }], nextCursor: null })
    render(<AIRoundtablePage />)
    await user.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load roundtable history')
    expect(screen.getByText('Roundtable: Old test chat')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Roundtable: Older thread')).toBeVisible()
    expect(screen.getByText('Roundtable: Old test chat')).toBeVisible()
    expect(mockApiClient.getConversationPage).toHaveBeenLastCalledWith('roundtable', 'older-page')
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /DeepSeek/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Free Community/i)).not.toBeInTheDocument()
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
    expect(mockApiClient.getConversationMessages).toHaveBeenCalledWith('roundtable-1', undefined, 1)

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
    expect(mockApiClient.getConversationMessages).not.toHaveBeenCalled()
    expect(screen.getByText('Roundtable: Old test chat')).toBeInTheDocument()
  })

  it('keeps Start disabled until a stopped request settles', async () => {
    let rejectGeneration!: (reason: Error) => void
    let finishRefresh!: (value: { items: typeof roundtableConversation[]; nextCursor: null }) => void
    mockApiClient.getConversationPage
      .mockResolvedValueOnce({ items: [roundtableConversation], nextCursor: null })
      .mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    mockApiClient.createConversation.mockResolvedValue(roundtableConversation)
    mockFetch.mockImplementation((input: RequestInfo | URL) => String(input).includes('/api/llm/stream')
      ? new Promise((_resolve, reject) => { rejectGeneration = reject })
      : Promise.resolve({ ok: true, json: async () => ({ configuredProviders: ['openai', 'anthropic'] }) }))
    const user = userEvent.setup()
    render(<AIRoundtablePage />)
    await screen.findByText('Roundtable: Old test chat')
    await user.type(screen.getByPlaceholderText('Describe the objective for the AI conversation...'), 'Cancellation goal')
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    await screen.findByText('Thinking...')
    await user.click(screen.getByRole('button', { name: /^stop$/i }))
    expect(screen.getByRole('button', { name: /^start$/i })).toBeDisabled()
    await act(async () => rejectGeneration(new DOMException('Stopped', 'AbortError')))
    expect(await screen.findByText('Stopped', { exact: true })).toBeVisible()
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
    expect(screen.queryByText('Roundtable saved to history.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^start$/i })).toBeDisabled()
    await act(async () => finishRefresh({ items: [roundtableConversation], nextCursor: null }))
    expect(screen.getByRole('button', { name: /^start$/i })).toBeEnabled()
    expect(mockApiClient.createConversation).toHaveBeenCalledTimes(1)
  })

  it('retains partial output when the server aborts a generation', async () => {
    mockApiClient.createConversation.mockResolvedValue(roundtableConversation)
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/llm/stream')) return new Response(
        JSON.stringify({ type: 'chunk', content: 'Partial persisted response' }) + '\n' + JSON.stringify({ type: 'aborted' }) + '\n'
      )
      return { ok: true, json: async () => ({ configuredProviders: ['openai', 'anthropic'] }) }
    })
    const user = userEvent.setup()
    render(<AIRoundtablePage />)
    await screen.findByText('Roundtable: Old test chat')
    await user.type(screen.getByPlaceholderText('Describe the objective for the AI conversation...'), 'Partial goal')
    await user.click(screen.getByRole('button', { name: /^start$/i }))
    expect(await screen.findByText('Stopped', { exact: true })).toBeVisible()
    expect(screen.getByText('Partial persisted response')).toBeVisible()
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
    expect(mockFetch.mock.calls.filter(call => String(call[0]).includes('/api/llm/stream'))).toHaveLength(1)
  })

  it.each(['interrupted', 'cancelled', 'failed', 'running'])('shows saved %s generation status on reload', async status => {
    mockApiClient.getConversationMessages.mockResolvedValue({ ...roundtableConversation, messages: [
      { id: 'goal', role: 'user', content: 'Goal: Recovery goal', createdAt: new Date() },
      { id: 'partial', role: 'assistant', content: 'Saved partial content', instanceId: 'Researcher', generationStatus: status, createdAt: new Date() },
    ] })
    const user = userEvent.setup()
    render(<AIRoundtablePage />)
    await user.click((await screen.findByText('Roundtable: Old test chat')).closest('button')!)
    expect(await screen.findByText('Saved partial content')).toBeVisible()
    expect(screen.getByText({ interrupted: 'Interrupted', cancelled: 'Stopped', failed: 'Failed', running: 'Generating' }[status]!)).toBeVisible()
    expect(mockApiClient.getConversationMessages).toHaveBeenCalledWith('roundtable-1', undefined, 1)
  })

  it('persists completed turns on the server and retains the active transcript', async () => {
    const user = userEvent.setup()
    const newConversation = {
      id: 'roundtable-new',
      title: 'Roundtable: New archived goal',
      userId: 'user-1',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:01:00.000Z'),
    }

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/llm/stream')) {
        return createStreamResponse('Archived response')
      }

      return {
        ok: true,
        json: async () => ({ configuredProviders: ['openai', 'anthropic'] }),
      } as Response
    })
    mockApiClient.createConversation.mockResolvedValue(newConversation)
    mockApiClient.addMessages.mockResolvedValue({})
    mockApiClient.getConversationPage
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [newConversation], nextCursor: null })

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
    expect(goalInput).toHaveValue('New archived goal')
    expect(screen.getAllByText('Archived response')).toHaveLength(2)
    expect(mockApiClient.addMessages).not.toHaveBeenCalled()
    const generationRequest = mockFetch.mock.calls.find(call => String(call[0]).includes('/api/llm/stream'))
    expect(JSON.parse(generationRequest![1].body)).toMatchObject({ conversationId: expect.any(String), turnId: expect.any(String), requestId: expect.any(String) })
    expect(await screen.findByText('Roundtable: New archived goal')).toBeInTheDocument()
    expect(
      screen.getByText('Roundtable: New archived goal').closest('button')?.parentElement?.className
    ).toContain('border-primary')
  }, 10_000)
})
