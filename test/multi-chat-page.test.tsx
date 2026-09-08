import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, fireEvent, act } from '@/test/test-utils'
import MultiChatPage from '@/app/multi-chat/page'

const mockApiClient = vi.hoisted(() => ({
  getConversationPage: vi.fn(),
  createConversation: vi.fn(),
  addMessages: vi.fn(),
}))

vi.mock('next-auth/react', async original => ({ ...await original<typeof import('next-auth/react')>(), useSession: () => ({ status: 'authenticated', data: { user: { id: 'test-user' } } }), SessionProvider: ({ children }: { children: import('react').ReactNode }) => children }))

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}))

describe('MultiChatPage provider model picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
    mockApiClient.getConversationPage.mockResolvedValue({ items: [], nextCursor: null })
    mockApiClient.createConversation.mockResolvedValue({ id: 'saved-conversation', title: 'Test conversation', updatedAt: new Date() })
    mockApiClient.addMessages.mockResolvedValue(undefined)
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

  it('offers every catalog-backed provider and recent OpenAI/Anthropic models', async () => {
    const user = userEvent.setup()
    render(<MultiChatPage />)

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
    expect(screen.getByRole('option', { name: 'Claude Fable 5' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Mistral/i }))
    expect(screen.getByRole('option', { name: 'Mistral Large' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Ollama \(local\)/i }))
    expect(screen.getByRole('option', { name: 'Llama 3 (8B)' })).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: /Kimi \(Moonshot AI\)/i })
    )
    expect(screen.getByRole('option', { name: 'Kimi K3' })).toBeVisible()

  })
  it('saves once before parallel dispatch and keeps a successful model when another fails', async () => {
    const user = userEvent.setup()
    let save!: (value: unknown) => void
    mockApiClient.createConversation.mockImplementationOnce(() => new Promise(resolve => { save = resolve }))
    const requests: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/config') return Response.json({ configuredProviders: ['openai', 'anthropic'] })
      const body = JSON.parse(init!.body as string)
      requests.push(body)
      const events = body.provider === 'openai' ? [{ type: 'chunk', content: 'Working model answer' }, { type: 'done' }] : [{ type: 'error', error: 'Provider temporarily unavailable', code: 'PROVIDER_UNAVAILABLE' }]
      return new Response(events.map(event => JSON.stringify(event)).join('\n') + '\n')
    }))
    render(<MultiChatPage />)
    const input = screen.getByRole('textbox', { name: 'Message' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'Compare this question')
    fireEvent.submit(input.closest('form')!)
    fireEvent.submit(input.closest('form')!)
    expect(mockApiClient.createConversation).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(0)
    await act(async () => save({ id: 'saved-conversation', title: 'Test conversation', updatedAt: new Date() }))
    expect(await screen.findByText('Working model answer')).toBeVisible()
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider temporarily unavailable')
    expect(requests).toHaveLength(2)
    const turn = mockApiClient.createConversation.mock.calls[0][0].messages[0].clientId
    expect(requests.map(request => request.position)).toEqual([0, 1])
    expect(requests.every(request => request.conversationId === 'saved-conversation' && request.turnId === turn)).toBe(true)
    expect(mockApiClient.addMessages).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Regenerate openai/ }))
    await waitFor(() => expect(requests).toHaveLength(3))
    expect(requests[2].turnId).toBe(turn)
    expect(requests[2].requestId).not.toBe(requests[0].requestId)
    expect(mockApiClient.createConversation).toHaveBeenCalledTimes(1)
  })

  it('preserves an unsaved prompt and never dispatches when saving fails', async () => {
    const user = userEvent.setup()
    mockApiClient.createConversation.mockRejectedValueOnce(new Error('Save failed'))
    const fetch = vi.fn(async (_url: string) => Response.json({ configuredProviders: ['openai'] }))
    vi.stubGlobal('fetch', fetch)
    render(<MultiChatPage />)
    const input = screen.getByRole('textbox', { name: 'Message' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'Keep my unsaved question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(input).toBeEnabled())
    expect(input).toHaveValue('Keep my unsaved question')
    expect(fetch.mock.calls.every(call => call[0] !== '/api/llm/stream')).toBe(true)
  })

  it('stops a pending stream and retains its partial response', async () => {
    const user = userEvent.setup()
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/config') return Response.json({ configuredProviders: ['openai'] })
      signal = init!.signal as AbortSignal
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"chunk","content":"Partial answer"}\n')) } }))
    }))
    render(<MultiChatPage />)
    const input = screen.getByRole('textbox', { name: 'Message' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, 'Start a response')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('Partial answer')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Stop generation' }))
    await waitFor(() => expect(input).toBeEnabled())
    expect(signal.aborted).toBe(true)
    expect(screen.getByText('Partial answer')).toBeVisible()
    expect(screen.getByText('Stopped. Reload to check saved progress.')).toBeVisible()
  })

})
