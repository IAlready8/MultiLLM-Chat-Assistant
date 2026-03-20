import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const mockGetAuthenticatedUser = vi.fn()
const mockRecordAnalyticsEvent = vi.fn()
const mockPersonaService = {
  getPersonasByUserId: vi.fn(),
  getPersonaById: vi.fn(),
  createPersona: vi.fn(),
  updatePersona: vi.fn(),
  deletePersona: vi.fn(),
}

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: (options: unknown) => mockGetAuthenticatedUser(options),
}))

vi.mock('@/services/persona-service.db', () => ({
  PersonaService: {
    getPersonasByUserId: (...args: unknown[]) =>
      mockPersonaService.getPersonasByUserId(...args),
    getPersonaById: (...args: unknown[]) =>
      mockPersonaService.getPersonaById(...args),
    createPersona: (...args: unknown[]) =>
      mockPersonaService.createPersona(...args),
    updatePersona: (...args: unknown[]) =>
      mockPersonaService.updatePersona(...args),
    deletePersona: (...args: unknown[]) =>
      mockPersonaService.deletePersona(...args),
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
  GET as getPersonas,
  POST as createPersona,
} from '@/app/api/personas/route'
import {
  GET as getPersonaById,
  PUT as updatePersona,
  DELETE as deletePersona,
} from '@/app/api/personas/[id]/route'

const rootRouteContext = { params: Promise.resolve({}) }
const idRouteContext = (id: string) => ({ params: Promise.resolve({ id }) })

describe('/api/personas routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUser.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('root GET returns personas for authenticated user', async () => {
    mockPersonaService.getPersonasByUserId.mockResolvedValue([
      {
        id: 'persona-1',
        userId: 'user-1',
        title: 'Research Analyst',
        description: 'Investigates deeply',
        prompt: 'Always cite evidence',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])

    const response = await getPersonas(
      new Request('http://localhost/api/personas'),
      rootRouteContext
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe('Research Analyst')
    expect(mockPersonaService.getPersonasByUserId).toHaveBeenCalledWith('user-1')
  })

  it('root POST validates required fields', async () => {
    const response = await createPersona(
      new Request('http://localhost/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      rootRouteContext
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
    expect(mockPersonaService.createPersona).not.toHaveBeenCalled()
  })

  it('root POST maps name/systemPrompt fields and creates persona', async () => {
    mockPersonaService.createPersona.mockResolvedValue({
      id: 'persona-1',
      userId: 'user-1',
      title: 'Architect',
      description: 'Designs systems',
      prompt: 'Think in trade-offs',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const response = await createPersona(
      new Request('http://localhost/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Architect',
          systemPrompt: 'Think in trade-offs',
          description: 'Designs systems',
        }),
      }),
      rootRouteContext
    )

    expect(response.status).toBe(201)
    expect(mockPersonaService.createPersona).toHaveBeenCalledWith(
      {
        title: 'Architect',
        prompt: 'Think in trade-offs',
        description: 'Designs systems',
      },
      'user-1'
    )
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'persona_created',
      userId: 'user-1',
      payload: { title: 'Architect' },
    })
  })

  it('id GET returns 404 when persona does not exist', async () => {
    mockPersonaService.getPersonaById.mockResolvedValue(null)

    const response = await getPersonaById(
      new Request('http://localhost/api/personas/persona-1'),
      idRouteContext('persona-1')
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Persona not found' })
  })

  it('id PUT validates empty updates', async () => {
    const response = await updatePersona(
      new Request('http://localhost/api/personas/persona-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai' }),
      }),
      idRouteContext('persona-1')
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'No updatable persona fields provided',
    })
  })

  it('id PUT updates an existing persona', async () => {
    mockPersonaService.updatePersona.mockResolvedValue({
      id: 'persona-1',
      userId: 'user-1',
      title: 'Updated Persona',
      description: 'Updated',
      prompt: 'Updated prompt',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    })

    const response = await updatePersona(
      new Request('http://localhost/api/personas/persona-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Persona',
          prompt: 'Updated prompt',
          description: 'Updated',
        }),
      }),
      idRouteContext('persona-1')
    )

    expect(response.status).toBe(200)
    expect(mockPersonaService.updatePersona).toHaveBeenCalledWith(
      'persona-1',
      {
        title: 'Updated Persona',
        description: 'Updated',
        prompt: 'Updated prompt',
      },
      'user-1'
    )
  })

  it('id DELETE returns success when persona is deleted', async () => {
    mockPersonaService.deletePersona.mockResolvedValue(true)

    const response = await deletePersona(
      new Request('http://localhost/api/personas/persona-1', {
        method: 'DELETE',
      }),
      idRouteContext('persona-1')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mockPersonaService.deletePersona).toHaveBeenCalledWith(
      'persona-1',
      'user-1'
    )
  })

  it('forwards auth response when auth check fails', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const response = await getPersonas(
      new Request('http://localhost/api/personas'),
      rootRouteContext
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
