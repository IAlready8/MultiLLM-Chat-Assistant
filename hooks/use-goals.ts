import { useCallback, useEffect, useState } from 'react'
import { Goal } from '@/types/prisma'
import { apiClient } from '@/lib/api-client'

type NewGoal = Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

export const useGoals = () => {
  const [goals, setGoals] = useState<Goal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchGoals = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await apiClient.getGoals()
      setGoals(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchGoals()
  }, [fetchGoals])

  const createGoal = useCallback(async (newGoalData: NewGoal) => {
    const now = new Date()
    const optimisticGoal: Goal = {
      ...newGoalData,
      id: `temp-${Date.now()}`,
      userId: 'temp-user',
      createdAt: now,
      updatedAt: now,
    }

    setGoals((prev) => [optimisticGoal, ...prev])

    try {
      const createdGoal = await apiClient.createGoal(newGoalData)
      setGoals((prev) =>
        prev.map((goal) => (goal.id === optimisticGoal.id ? createdGoal : goal))
      )
      setError(null)
      return createdGoal
    } catch (err) {
      setError(err as Error)
      setGoals((prev) => prev.filter((goal) => goal.id !== optimisticGoal.id))
      throw err
    }
  }, [])

  const updateGoal = useCallback(
    async (id: string, updates: Partial<NewGoal>) => {
      const previousGoals = [...goals]
      const now = new Date()

      setGoals((prev) =>
        prev.map((goal) =>
          goal.id === id
            ? {
                ...goal,
                ...updates,
                updatedAt: now,
              }
            : goal
        )
      )

      try {
        const updatedGoal = await apiClient.updateGoal(id, updates)
        setGoals((prev) =>
          prev.map((goal) => (goal.id === id ? updatedGoal : goal))
        )
        setError(null)
        return updatedGoal
      } catch (err) {
        setError(err as Error)
        setGoals(previousGoals)
        throw err
      }
    },
    [goals]
  )

  const deleteGoal = useCallback(
    async (id: string) => {
      const previousGoals = [...goals]
      setGoals((prev) => prev.filter((goal) => goal.id !== id))

      try {
        await apiClient.deleteGoal(id)
        setError(null)
      } catch (err) {
        setError(err as Error)
        setGoals(previousGoals)
        throw err
      }
    },
    [goals]
  )

  return {
    goals,
    isLoading,
    error,
    refreshGoals: fetchGoals,
    createGoal,
    updateGoal,
    deleteGoal,
  }
}
