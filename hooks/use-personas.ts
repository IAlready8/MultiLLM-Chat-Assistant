import { useState, useEffect, useCallback } from 'react'
import { Persona } from '@prisma/client'
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

  // 1. Initial Data Fetch
  useEffect(() => {
    const fetchPersonas = async () => {
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
    }
    fetchPersonas()
  }, [])

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
    } catch (err) {
      setError(err as Error)
      // Rollback optimistic update
      setPersonas((prev) => prev.filter((p) => p.id !== optimisticPersona.id))
    }
  }, [])

  // 3. Delete Persona
  const deletePersona = useCallback(async (id: string) => {
    const originalPersonas = [...personas]
    // Optimistic update
    setPersonas((prev) => prev.filter((p) => p.id !== id))

    try {
      // Real API call
      await apiClient.deletePersona(id)
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
    createPersona,
    deletePersona,
    // Note: updatePersona would follow the same optimistic pattern
  }
}