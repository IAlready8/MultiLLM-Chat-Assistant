import { beforeEach, describe, expect, it, vi } from 'vitest'

const DB_UNAVAILABLE_ERROR = new Error(
  'Database access for persona is not available in this environment.'
)

type PrismaMock = {
  persona: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}

const makePrismaMock = (): PrismaMock => ({
  persona: {
    findMany: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    findFirst: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    create: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    update: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
    delete: vi.fn().mockRejectedValue(DB_UNAVAILABLE_ERROR),
  },
})

const loadService = async () => {
  const prismaMock = makePrismaMock()
  vi.doMock('@/lib/prisma', () => ({ prisma: prismaMock }))
  const mod = await import('@/services/persona-service.db')
  return { PersonaService: mod.PersonaService, prismaMock }
}

const loadServiceWithPrismaMock = async (prismaMock: PrismaMock) => {
  vi.doMock('@/lib/prisma', () => ({ prisma: prismaMock }))
  const mod = await import('@/services/persona-service.db')
  return { PersonaService: mod.PersonaService, prismaMock }
}

describe('PersonaService DB fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { __multiLlmPersonaFallbackStore?: unknown })
      .__multiLlmPersonaFallbackStore
  })

  it('creates, reads, updates, and deletes via in-memory fallback when DB is unavailable', async () => {
    const { PersonaService } = await loadService()

    const created = await PersonaService.createPersona(
      {
        title: 'Research Analyst',
        description: 'Helps with detailed investigations',
        prompt: 'Always provide structured analysis.',
      },
      'user-1'
    )

    expect(created.userId).toBe('user-1')

    const list = await PersonaService.getPersonasByUserId('user-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const single = await PersonaService.getPersonaById(created.id, 'user-1')
    expect(single?.title).toBe('Research Analyst')

    const updated = await PersonaService.updatePersona(
      created.id,
      { title: 'Senior Research Analyst', prompt: 'Provide concise analysis.' },
      'user-1'
    )

    expect(updated?.title).toBe('Senior Research Analyst')
    expect(updated?.prompt).toBe('Provide concise analysis.')

    const deleted = await PersonaService.deletePersona(created.id, 'user-1')
    expect(deleted).toBe(true)

    const afterDelete = await PersonaService.getPersonasByUserId('user-1')
    expect(afterDelete).toHaveLength(0)
  })

  it('uses fallback records when DB is reachable but user-scoped rows are missing', async () => {
    const fkConstraintError = new Error(
      'Foreign key constraint failed on the field: Persona_userId_fkey'
    )

    const prismaMock: PrismaMock = {
      persona: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(fkConstraintError),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }

    const { PersonaService } = await loadServiceWithPrismaMock(prismaMock)

    const created = await PersonaService.createPersona(
      {
        title: 'Guest Persona',
        description: 'Fallback persona entry',
        prompt: 'Be precise.',
      },
      'test-user-123'
    )

    const list = await PersonaService.getPersonasByUserId('test-user-123')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(created.id)

    const updated = await PersonaService.updatePersona(
      created.id,
      { title: 'Guest Persona Updated' },
      'test-user-123'
    )
    expect(updated?.title).toBe('Guest Persona Updated')

    const deleted = await PersonaService.deletePersona(
      created.id,
      'test-user-123'
    )
    expect(deleted).toBe(true)
  })

  it('keeps production reads DB-first without creating fallback stores', async () => {
    const env = process.env as Record<string, string | undefined>
    const previousNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'

    try {
      const prismaMock: PrismaMock = {
        persona: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'persona-1',
              userId: 'user-1',
              title: 'Persisted persona',
              description: 'Loaded from DB',
              prompt: 'Use DB data only.',
              createdAt: new Date('2026-03-02T00:00:00.000Z'),
              updatedAt: new Date('2026-03-02T00:00:00.000Z'),
            },
          ]),
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      }

      const { PersonaService } = await loadServiceWithPrismaMock(prismaMock)
      const personas = await PersonaService.getPersonasByUserId('user-1')

      expect(personas).toHaveLength(1)
      expect(personas[0].title).toBe('Persisted persona')
      const store = (
        globalThis as {
          __multiLlmPersonaFallbackStore?: Map<string, Map<string, unknown>>
        }
      ).__multiLlmPersonaFallbackStore
      expect(store?.size ?? 0).toBe(0)
    } finally {
      env.NODE_ENV = previousNodeEnv
    }
  })

  it('throws unexpected write errors instead of silently falling back', async () => {
    const unexpectedError = new Error('Unique constraint failed on title')

    const prismaMock: PrismaMock = {
      persona: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(unexpectedError),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }

    const { PersonaService } = await loadServiceWithPrismaMock(prismaMock)

    await expect(
      PersonaService.createPersona(
        {
          title: 'Should fail',
          description: 'Unexpected DB error should bubble up',
          prompt: 'Do not fallback for non-recoverable errors.',
        },
        'user-1'
      )
    ).rejects.toThrow('Unique constraint failed on title')
  })
})
