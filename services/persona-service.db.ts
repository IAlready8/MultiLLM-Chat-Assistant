import { prisma } from '@/lib/prisma'
import { Persona } from '@/types/prisma'
import {
  createDbAvailabilityTracker,
  getOrCreateUserStore,
  isUserForeignKeyConstraintError,
} from '@/lib/db-fallback'

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

const mergePersonasById = (
  dbPersonas: Persona[],
  fallbackPersonasForUser: Persona[]
): Persona[] => {
  const merged = new Map<string, Persona>()

  for (const persona of fallbackPersonasForUser) {
    merged.set(persona.id, clonePersona(persona))
  }

  for (const persona of dbPersonas) {
    merged.set(persona.id, persona)
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.title.localeCompare(b.title)
  )
}

export const PersonaService = {
  async getPersonasByUserId(userId: string): Promise<Persona[]> {
    if (db.isKnownUnavailable()) {
      return listFallbackPersonas(userId)
    }

    try {
      const personas = await prisma.persona.findMany({
        where: {
          userId,
        },
        orderBy: {
          title: 'asc',
        },
      })

      const fallback = listFallbackPersonas(userId)
      if (fallback.length === 0) {
        return personas
      }

      return mergePersonasById(personas, fallback)
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
      const persona = await prisma.persona.findFirst({
        where: {
          id,
          userId,
        },
      })

      if (persona) {
        return persona
      }

      const fallbackPersona = getFallbackUserStore(userId).get(id)
      return fallbackPersona ? clonePersona(fallbackPersona) : null
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
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      const userForeignKeyError = isUserForeignKeyConstraintError(error)
      if (!dbUnavailable && userForeignKeyError) {
        db.logWarningOnce('createPersona', 'persona', error)
      } else if (!dbUnavailable) {
        throw error
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
        return saveToFallback()
      }

      return await prisma.persona.update({
        where: {
          id,
        },
        data,
      })
    } catch (error) {
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      const userForeignKeyError = isUserForeignKeyConstraintError(error)
      if (!dbUnavailable && userForeignKeyError) {
        db.logWarningOnce('updatePersona', 'persona', error)
      } else if (!dbUnavailable) {
        throw error
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
        return getFallbackUserStore(userId).delete(id)
      }

      await prisma.persona.delete({
        where: {
          id,
        },
      })

      return true
    } catch (error) {
      const dbUnavailable = db.markUnavailableIfNeeded(error)
      const userForeignKeyError = isUserForeignKeyConstraintError(error)
      if (!dbUnavailable && userForeignKeyError) {
        db.logWarningOnce('deletePersona', 'persona', error)
      } else if (!dbUnavailable) {
        throw error
      }
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
