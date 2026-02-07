import { prisma } from '@/lib/prisma'
import { Goal } from '@/types/prisma'

export type GoalStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed'

type NewGoalData = Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
type GoalUpdateData = Partial<Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>

type GlobalGoalFallback = typeof globalThis & {
  __multiLlmGoalFallbackStore?: Map<string, Map<string, Goal>>
  __multiLlmGoalFallbackWarnings?: Set<string>
  __multiLlmGoalDbUnavailable?: boolean
}

const goalGlobal = globalThis as GlobalGoalFallback

const fallbackGoals: Map<string, Map<string, Goal>> =
  goalGlobal.__multiLlmGoalFallbackStore ??
  (goalGlobal.__multiLlmGoalFallbackStore = new Map<string, Map<string, Goal>>())

const fallbackWarnings: Set<string> =
  goalGlobal.__multiLlmGoalFallbackWarnings ??
  (goalGlobal.__multiLlmGoalFallbackWarnings = new Set<string>())

const statusAliases: Record<string, GoalStatus> = {
  pending: 'not-started',
  todo: 'not-started',
  new: 'not-started',
  'not-started': 'not-started',
  'in-progress': 'in-progress',
  active: 'in-progress',
  doing: 'in-progress',
  blocked: 'delayed',
  delayed: 'delayed',
  done: 'completed',
  completed: 'completed',
}

const normalizeStatus = (status: unknown): GoalStatus => {
  if (typeof status !== 'string') {
    return 'not-started'
  }
  const key = status.toLowerCase().trim()
  return statusAliases[key] ?? 'not-started'
}

const withNormalizedStatus = (goal: Goal): Goal => ({
  ...goal,
  status: normalizeStatus(goal.status),
})

const cloneGoal = (goal: Goal): Goal => ({
  ...goal,
  status: normalizeStatus(goal.status),
  createdAt: new Date(goal.createdAt),
  updatedAt: new Date(goal.updatedAt),
})

const createGoalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `goal-${crypto.randomUUID()}`
  }
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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
  goalGlobal.__multiLlmGoalDbUnavailable === true

const markDatabaseUnavailableIfNeeded = (error: unknown) => {
  if (isDatabaseUnavailableError(error)) {
    goalGlobal.__multiLlmGoalDbUnavailable = true
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
  console.warn(`Falling back to in-memory goal store for ${scope}: ${message}`)
}

const getFallbackUserStore = (userId: string) => {
  let store = fallbackGoals.get(userId)
  if (!store) {
    store = new Map<string, Goal>()
    fallbackGoals.set(userId, store)
  }
  return store
}

const listFallbackGoals = (userId: string): Goal[] =>
  Array.from(getFallbackUserStore(userId).values())
    .map(cloneGoal)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

export const GoalService = {
  async getGoalsByUserId(userId: string): Promise<Goal[]> {
    if (isDatabaseKnownUnavailable()) {
      return listFallbackGoals(userId)
    }

    try {
      const goals = await prisma.goal.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      })
      return goals.map((goal) => withNormalizedStatus(goal))
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('getGoalsByUserId', error)
      }
      return listFallbackGoals(userId)
    }
  },

  async getGoalById(id: string, userId: string): Promise<Goal | null> {
    if (isDatabaseKnownUnavailable()) {
      const goal = getFallbackUserStore(userId).get(id)
      return goal ? cloneGoal(goal) : null
    }

    try {
      const goal = await prisma.goal.findFirst({
        where: { id, userId },
      })
      return goal ? withNormalizedStatus(goal) : null
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('getGoalById', error)
      }
      const goal = getFallbackUserStore(userId).get(id)
      return goal ? cloneGoal(goal) : null
    }
  },

  async createGoal(data: NewGoalData, userId: string): Promise<Goal> {
    const saveToFallback = () => {
      const now = new Date()
      const goal: Goal = {
        id: createGoalId(),
        userId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        status: normalizeStatus(data.status),
        createdAt: now,
        updatedAt: now,
      }
      getFallbackUserStore(userId).set(goal.id, goal)
      return cloneGoal(goal)
    }

    if (isDatabaseKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      const created = await prisma.goal.create({
        data: {
          userId,
          title: data.title.trim(),
          description: data.description?.trim() || null,
          status: normalizeStatus(data.status),
        },
      })
      return withNormalizedStatus(created)
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('createGoal', error)
      }
      return saveToFallback()
    }
  },

  async updateGoal(
    id: string,
    data: GoalUpdateData,
    userId: string
  ): Promise<Goal | null> {
    const saveToFallback = () => {
      const store = getFallbackUserStore(userId)
      const existing = store.get(id)
      if (!existing) {
        return null
      }

      const updated: Goal = {
        ...existing,
        title: data.title?.trim() || existing.title,
        description:
          data.description === undefined
            ? existing.description
            : data.description?.trim() || null,
        status:
          data.status === undefined
            ? normalizeStatus(existing.status)
            : normalizeStatus(data.status),
        updatedAt: new Date(),
      }

      store.set(id, updated)
      return cloneGoal(updated)
    }

    if (isDatabaseKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      const existing = await prisma.goal.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return null
      }

      const updated = await prisma.goal.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title.trim() } : {}),
          ...(data.description !== undefined
            ? { description: data.description?.trim() || null }
            : {}),
          ...(data.status !== undefined
            ? { status: normalizeStatus(data.status) }
            : {}),
        },
      })

      return withNormalizedStatus(updated)
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('updateGoal', error)
      }
      return saveToFallback()
    }
  },

  async deleteGoal(id: string, userId: string): Promise<boolean> {
    if (isDatabaseKnownUnavailable()) {
      return getFallbackUserStore(userId).delete(id)
    }

    try {
      const existing = await prisma.goal.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return false
      }

      await prisma.goal.delete({
        where: { id },
      })
      return true
    } catch (error) {
      if (!markDatabaseUnavailableIfNeeded(error)) {
        logFallbackWarning('deleteGoal', error)
      }
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
