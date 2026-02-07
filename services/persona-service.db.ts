import { prisma } from '@/lib/prisma'
import { Persona } from '@/types/prisma'

type NewPersonaData = Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
type PersonaUpdateData = Partial<Omit<Persona, 'id' | 'userId' | 'createdAt'>>

type GlobalPersonaFallback = typeof globalThis & {
  __multiLlmPersonaFallbackStore?: Map<string, Map<string, Persona>>
  __multiLlmPersonaFallbackWarnings?: Set<string>
  __multiLlmPersonaDbUnavailable?: boolean
}

const personaGlobal = globalThis as GlobalPersonaFallback

const fallbackPersonas: Map<string, Map<string, Persona>> =
  personaGlobal.__multiLlmPersonaFallbackStore ??
  (personaGlobal.__multiLlmPersonaFallbackStore = new Map<
    string,
    Map<string, Persona>
  >())

const fallbackWarnings: Set<string> =
  personaGlobal.__multiLlmPersonaFallbackWarnings ??
  (personaGlobal.__multiLlmPersonaFallbackWarnings = new Set())

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }
  return ''
}

const isDatabaseUnavailableError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  return (
    message.includes('Database access for') ||
    message.includes('Database access is not available')
  )
}

const isDatabaseKnownUnavailable = () =>
  personaGlobal.__multiLlmPersonaDbUnavailable === true

const markDatabaseUnavailableIfNeeded = (error: unknown) => {
  if (isDatabaseUnavailableError(error)) {
    personaGlobal.__multiLlmPersonaDbUnavailable = true
    return true
  }
  return false
}

const logFallbackWarning = (scope: string, error: unknown) => {
  if (fallbackWarnings.has(scope)) {
    return
  }
  fallbackWarnings.add(scope)
  const message = getErrorMessage(error) || 'unknown database error'
  console.warn(`Falling back to in-memory persona store for ${scope}: ${message}`)
}

const getFallbackUserStore = (userId: string) => {
  let store = fallbackPersonas.get(userId)
  if (!store) {
    store = new Map<string, Persona>()
    fallbackPersonas.set(userId, store)
  }
  return store
}

const clonePersona = (persona: Persona): Persona => ({
  ...persona,
  createdAt: new Date(persona.createdAt),
  updatedAt: new Date(persona.updatedAt),
})

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `persona-${crypto.randomUUID()}`
  }
  return `persona-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const listFallbackPersonas = (userId: string): Persona[] =>
  Array.from(getFallbackUserStore(userId).values())
    .map(clonePersona)
    .sort((a, b) => a.title.localeCompare(b.title))

export const PersonaService = {
  async getPersonasByUserId(userId: string): Promise<Persona[]> {
    if (isDatabaseKnownUnavailable()) {
      return listFallbackPersonas(userId)
    }

    try {
      return await prisma.persona.findMany({
        where: {
          userId,
        },
        orderBy: {
          title: 'asc',
        },
      })
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('getPersonasByUserId', error)
      }
      return listFallbackPersonas(userId)
    }
  },

  async getPersonaById(id: string, userId: string): Promise<Persona | null> {
    if (isDatabaseKnownUnavailable()) {
      const persona = getFallbackUserStore(userId).get(id)
      return persona ? clonePersona(persona) : null
    }

    try {
      return await prisma.persona.findFirst({
        where: {
          id,
          userId,
        },
      })
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('getPersonaById', error)
      }
      const persona = getFallbackUserStore(userId).get(id)
      return persona ? clonePersona(persona) : null
    }
  },

  async createPersona(data: NewPersonaData, userId: string): Promise<Persona> {
    const saveToFallback = () => {
      const now = new Date()
      const persona: Persona = {
        id: createId(),
        userId,
        title: data.title,
        description: data.description ?? null,
        prompt: data.prompt,
        createdAt: now,
        updatedAt: now,
      }
      getFallbackUserStore(userId).set(persona.id, persona)
      return clonePersona(persona)
    }

    if (isDatabaseKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      return await prisma.persona.create({
        data: {
          ...data,
          userId,
        },
      })
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('createPersona', error)
      }
      return saveToFallback()
    }
  },

  async updatePersona(
    id: string,
    data: PersonaUpdateData,
    userId: string
  ): Promise<Persona | null> {
    const saveToFallback = () => {
      const store = getFallbackUserStore(userId)
      const existing = store.get(id)
      if (!existing) {
        return null
      }

      const updated: Persona = {
        ...existing,
        title: data.title ?? existing.title,
        description:
          data.description === undefined ? existing.description : data.description,
        prompt: data.prompt ?? existing.prompt,
        updatedAt: new Date(),
      }

      store.set(id, updated)
      return clonePersona(updated)
    }

    if (isDatabaseKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      const existingPersona = await prisma.persona.findFirst({
        where: {
          id,
          userId,
        },
      })

      if (!existingPersona) {
        return null
      }

      return await prisma.persona.update({
        where: {
          id,
        },
        data,
      })
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('updatePersona', error)
      }
      return saveToFallback()
    }
  },

  async deletePersona(id: string, userId: string): Promise<boolean> {
    if (isDatabaseKnownUnavailable()) {
      return getFallbackUserStore(userId).delete(id)
    }

    try {
      const existingPersona = await prisma.persona.findFirst({
        where: {
          id,
          userId,
        },
      })

      if (!existingPersona) {
        return false
      }

      await prisma.persona.delete({
        where: {
          id,
        },
      })

      return true
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('deletePersona', error)
      }
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
