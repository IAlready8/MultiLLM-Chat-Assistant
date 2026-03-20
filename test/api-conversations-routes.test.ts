import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()
const mockConversationService = {
  getConversationsByUserId: vi.fn(),
  createConversation: vi.fn(),
  getFullConversation: vi.fn(),
  addMessages: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
}

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/services/conversation-service.db', () => ({
  ConversationService: {
    getConversationsByUserId: (...args: unknown[]) =>
      mockConversationService.getConversationsByUserId(...args),
    createConversation: (...args: unknown[]) =>
      mockConversationService.createConversation(...args),
    getFullConversation: (...args: unknown[]) =>
      mockConversationService.getFullConversation(...args),
    addMessages: (...args: unknown[]) => mockConversationService.addMessages(...args),
    updateConversationTitle: (...args: unknown[]) =>
      mockConversationService.updateConversationTitle(...args),
    deleteConversation: (...args: unknown[]) =>
      mockConversationService.deleteConversation(...args),
  },
}))

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: (event: unknown) => mockRecordAnalyticsEvent(event),
}))

vi.mock('@/lib/api-metrics-wrapper', () => ({
  withApiMetrics: (
    handler: (
      req: Request,
      ctx: { params: Promise<Record<string, string | string[] | undefined>> }
    ) => Promise<Response>
  ) => handler,
}))

import {
  GET as getConversations,
  POST as createConversation,
} from '@/app/api/conversations/route'
import {
  GET as getConversationById,
  POST as addMessages,
  PUT as updateConversation,
  DELETE as deleteConversation,
} from '@/app/api/conversations/[id]/route'

const rootRouteContext = { params: Promise.resolve({}) }
const idRouteContext = (id: string) => ({ params: Promise.resolve({ id }) })

describe('/api/conversations routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('root GET returns conversations for authenticated user', async () => {
    mockConversationService.getConversationsByUserId.mockResolvedValue([
      {
        id: 'conv-1',
        title: 'Weekly planning',
        userId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])

    const response = await getConversations(
      new Request('http://localhost/api/conversations'),
      rootRouteContext
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toHaveLength(1)
    expect(mockConversationService.getConversationsByUserId).toHaveBeenCalledWith(
      'user-1'
    )
  })

  it('root POST validates invalid payload', async () => {
    const response = await createConversation(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', messages: [] }),
      }),
      rootRouteContext
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
  })

  it('root POST strips cost/latency and creates conversation', async () => {
    mockConversationService.createConversation.mockResolvedValue({
      id: 'conv-1',
      title: 'Weekly planning',
      userId: 'user-1',
      messages: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const response = await createConversation(
      new Request('http://localhost/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Weekly planning',
          messages: [
            {
              role: 'user',
              content: 'Summarize this',
              provider: 'openai',
              model: 'gpt-4',
              cost: 0.13,
              latency: 420,
            },
          ],
        }),
      }),
      rootRouteContext
    )

    expect(response.status).toBe(201)
    expect(mockConversationService.createConversation).toHaveBeenCalledWith(
      'user-1',
      'Weekly planning',
      [
        {
          role: 'user',
          content: 'Summarize this',
          provider: 'openai',
          model: 'gpt-4',
        },
      ]
    )
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'conversation_created',
      userId: 'user-1',
      payload: {
        messageCount: 1,
        hasProviderTaggedMessage: true,
      },
    })
  })

  it('id GET returns 404 when conversation is missing', async () => {
    mockConversationService.getFullConversation.mockResolvedValue(null)

    const response = await getConversationById(
      new Request('http://localhost/api/conversations/conv-1'),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Conversation not found',
    })
  })

  it('id POST validates message payload', async () => {
    const response = await addMessages(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
  })

  it('id POST appends messages with normalized nullable fields', async () => {
    mockConversationService.addMessages.mockResolvedValue({
      id: 'conv-1',
      title: 'Weekly planning',
      userId: 'user-1',
      messages: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const response = await addMessages(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            role: 'assistant',
            content: 'Here is the summary.',
            provider: null,
            model: null,
            cost: 0.2,
            latency: 321,
          },
        ]),
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(200)
    expect(mockConversationService.addMessages).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
      [
        {
          role: 'assistant',
          content: 'Here is the summary.',
          provider: null,
          model: null,
        },
      ]
    )
    expect(mockRecordAnalyticsEvent).not.toHaveBeenCalled()
  })

  it('id POST records comparison-ready saves when provider-tagged assistant messages are added', async () => {
    mockConversationService.addMessages.mockResolvedValue({
      id: 'conv-1',
      title: 'Weekly planning',
      userId: 'user-1',
      messages: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const response = await addMessages(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            role: 'assistant',
            content: 'OpenAI draft',
            provider: 'openai',
            model: 'gpt-4o',
          },
          {
            role: 'assistant',
            content: 'Claude draft',
            provider: 'anthropic',
            model: 'claude-3-7-sonnet',
          },
        ]),
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(200)
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'comparison_ready_conversation_saved',
      userId: 'user-1',
      payload: {
        conversationId: 'conv-1',
        responseCount: 2,
        providers: ['openai', 'anthropic'],
      },
    })
  })

  it('id PUT validates title payload', async () => {
    const response = await updateConversation(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid input',
    })
  })

  it('id PUT updates an existing conversation title', async () => {
    mockConversationService.updateConversationTitle.mockResolvedValue({
      id: 'conv-1',
      title: 'Renamed Conversation',
      userId: 'user-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const response = await updateConversation(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Renamed Conversation' }),
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(200)
    expect(mockConversationService.updateConversationTitle).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
      'Renamed Conversation'
    )
    await expect(response.json()).resolves.toMatchObject({
      id: 'conv-1',
      title: 'Renamed Conversation',
    })
  })

  it('id PUT returns 404 when conversation is missing', async () => {
    mockConversationService.updateConversationTitle.mockResolvedValue(null)

    const response = await updateConversation(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Renamed Conversation' }),
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Conversation not found',
    })
  })

  it('id DELETE returns 404 when delete fails', async () => {
    mockConversationService.deleteConversation.mockResolvedValue(false)

    const response = await deleteConversation(
      new Request('http://localhost/api/conversations/conv-1', {
        method: 'DELETE',
      }),
      idRouteContext('conv-1')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Conversation not found or failed to delete',
    })
  })

  it('forwards auth response when authentication fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await getConversations(
      new Request('http://localhost/api/conversations'),
      rootRouteContext
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
