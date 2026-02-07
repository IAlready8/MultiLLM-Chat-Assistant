import { useState, useEffect, useCallback } from 'react'
import { Persona } from '@/types/prisma'
import { apiClient } from '@/lib/api-client'

type NewPersona = Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

/**
 * Refactored hook for managing personas.
 * - Replaces 'localStorage' with server-side API calls.
 * - Provides optimistic updates for a fast UI.
 */
export const usePersonas = () => {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchPersonas = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await apiClient.getPersonas()
      setPersonas(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 1. Initial Data Fetch
  useEffect(() => {
    void fetchPersonas()
  }, [fetchPersonas])

  // 2. Create Persona
  const createPersona = useCallback(async (newPersonaData: NewPersona) => {
    // Optimistic update
    const optimisticPersona: Persona = {
      ...newPersonaData,
      id: `temp-${Date.now()}`,
      userId: 'temp-user', // The UI doesn't need this, but the type requires it
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setPersonas((prev) => [...prev, optimisticPersona])

    try {
      // Real API call
      const createdPersona = await apiClient.createPersona(newPersonaData)
      // Replace optimistic persona with real one
      setPersonas((prev) =>
        prev.map((p) =>
          p.id === optimisticPersona.id ? createdPersona : p
        )
      )
      setError(null)
    } catch (err) {
      setError(err as Error)
      // Rollback optimistic update
      setPersonas((prev) => prev.filter((p) => p.id !== optimisticPersona.id))
    }
  }, [])

  // 3. Update Persona
  const updatePersona = useCallback(async (
    id: string,
    updates: Partial<NewPersona>
  ) => {
    const originalPersonas = [...personas]
    const now = new Date()

    setPersonas((prev) =>
      prev.map((persona) =>
        persona.id === id
          ? {
              ...persona,
              ...updates,
              updatedAt: now,
            }
          : persona
      )
    )

    try {
      const updatedPersona = await apiClient.updatePersona(id, updates)
      setPersonas((prev) =>
        prev.map((persona) =>
          persona.id === id ? updatedPersona : persona
        )
      )
      setError(null)
    } catch (err) {
      setError(err as Error)
      setPersonas(originalPersonas)
    }
  }, [personas])

  // 4. Delete Persona
  const deletePersona = useCallback(async (id: string) => {
    const originalPersonas = [...personas]
    // Optimistic update
    setPersonas((prev) => prev.filter((p) => p.id !== id))

    try {
      // Real API call
      await apiClient.deletePersona(id)
      setError(null)
    } catch (err) {
      setError(err as Error)
      // Rollback optimistic update
      setPersonas(originalPersonas)
    }
  }, [personas])

  return {
    personas,
    isLoading,
    error,
    refreshPersonas: fetchPersonas,
    createPersona,
    updatePersona,
    deletePersona,
  }
}
