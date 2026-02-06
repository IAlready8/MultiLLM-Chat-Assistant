import { prisma } from '@/lib/prisma'
import { Persona } from '@/types/prisma'

/**
 * This service provides all database operations for Personas,
 * replacing the old client-side localStorage logic.
 */
export const PersonaService = {
  /**
   * Get all personas for a specific user.
   */
  async getPersonasByUserId(userId: string): Promise<Persona[]> {
    return prisma.persona.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        title: 'asc',
      },
    })
  },

  /**
   * Get a single persona by its ID, ensuring it belongs to the user.
   */
  async getPersonaById(id: string, userId: string): Promise<Persona | null> {
    return prisma.persona.findFirst({
      where: {
        id: id,
        userId: userId,
      },
    })
  },

  /**
   * Create a new persona for a user.
   */
  async createPersona(
    data: Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<Persona> {
    return prisma.persona.create({
      data: {
        ...data,
        userId: userId,
      },
    })
  },

  /**
   * Update an existing persona, ensuring it belongs to the user.
   */
  async updatePersona(
    id: string,
    data: Partial<Omit<Persona, 'id' | 'userId'>>,
    userId: string
  ): Promise<Persona | null> {
    // First, verify the persona belongs to the user
    const existingPersona = await this.getPersonaById(id, userId)
    if (!existingPersona) {
      return null // Not found or not authorized
    }

    return prisma.persona.update({
      where: {
        id: id,
      },
      data: data,
    })
  },

  /**
   * Delete a persona, ensuring it belongs to the user.
   */
  async deletePersona(id: string, userId: string): Promise<boolean> {
    const existingPersona = await this.getPersonaById(id, userId)
    if (!existingPersona) {
      return false // Not found or not authorized
    }

    await prisma.persona.delete({
      where: {
        id: id,
      },
    })
    return true
  },
}
