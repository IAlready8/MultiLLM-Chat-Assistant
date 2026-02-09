import { prisma } from '@/lib/prisma'
import { Persona } from '@/types/prisma'
import { createDbAvailabilityTracker, getOrCreateUserStore } from '@/lib/db-fallback'

type NewPersonaData = Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
type PersonaUpdateData = Partial<Omit<Persona, 'id' | 'userId' | 'createdAt'>>

type GlobalPersonaFallback = typeof globalThis & {
  __multiLlmPersonaFallbackStore?: Map<string, Map<string, Persona>>
}

const personaGlobal = globalThis as GlobalPersonaFallback

const fallbackPersonas: Map<string, Map<string, Persona>> =
  personaGlobal.__multiLlmPersonaFallbackStore ??
  (personaGlobal.__multiLlmPersonaFallbackStore = new Map<
    string,
    Map<string, Persona>
  >())

const db = createDbAvailabilityTracker()

const getFallbackUserStore = (userId: string) =>
  getOrCreateUserStore(fallbackPersonas, userId)

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
    if (db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getPersonasByUserId', 'persona', error)
      }
      return listFallbackPersonas(userId)
    }
  },

  async getPersonaById(id: string, userId: string): Promise<Persona | null> {
    if (db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getPersonaById', 'persona', error)
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

    if (db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('createPersona', 'persona', error)
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

    if (db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('updatePersona', 'persona', error)
      }
      return saveToFallback()
    }
  },

  async deletePersona(id: string, userId: string): Promise<boolean> {
    if (db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('deletePersona', 'persona', error)
      }
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
