import { prisma } from '@/lib/prisma'
import { Goal } from '@/types/prisma'
import { createDbAvailabilityTracker, getOrCreateUserStore } from '@/lib/db-fallback'

export type GoalStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed'

type NewGoalData = Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
type GoalUpdateData = Partial<Omit<Goal, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>

type GlobalGoalFallback = typeof globalThis & {
  __multiLlmGoalFallbackStore?: Map<string, Map<string, Goal>>
}

const goalGlobal = globalThis as GlobalGoalFallback

const fallbackGoals: Map<string, Map<string, Goal>> =
  goalGlobal.__multiLlmGoalFallbackStore ??
  (goalGlobal.__multiLlmGoalFallbackStore = new Map<string, Map<string, Goal>>())

const db = createDbAvailabilityTracker()

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

const getFallbackUserStore = (userId: string) =>
  getOrCreateUserStore(fallbackGoals, userId)

const listFallbackGoals = (userId: string): Goal[] =>
  Array.from(getFallbackUserStore(userId).values())
    .map(cloneGoal)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

const mergeGoalsById = (dbGoals: Goal[], fallbackGoals: Goal[]): Goal[] => {
  const merged = new Map<string, Goal>()

  for (const goal of fallbackGoals) {
    merged.set(goal.id, goal)
  }

  for (const goal of dbGoals) {
    merged.set(goal.id, withNormalizedStatus(goal))
  }

  return Array.from(merged.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )
}

export const GoalService = {
  async getGoalsByUserId(userId: string): Promise<Goal[]> {
    if (db.isKnownUnavailable()) {
      return listFallbackGoals(userId)
    }

    try {
      const goals = await prisma.goal.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      })
      const fallback = listFallbackGoals(userId)
      if (fallback.length === 0) {
        return goals.map((goal) => withNormalizedStatus(goal))
      }

      return mergeGoalsById(goals, fallback)
    } catch (error) {
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getGoalsByUserId', 'goal', error)
      }
      return listFallbackGoals(userId)
    }
  },

  async getGoalById(id: string, userId: string): Promise<Goal | null> {
    if (db.isKnownUnavailable()) {
      const goal = getFallbackUserStore(userId).get(id)
      return goal ? cloneGoal(goal) : null
    }

    try {
      const goal = await prisma.goal.findFirst({
        where: { id, userId },
      })
      if (goal) {
        return withNormalizedStatus(goal)
      }

      const fallbackGoal = getFallbackUserStore(userId).get(id)
      return fallbackGoal ? cloneGoal(fallbackGoal) : null
    } catch (error) {
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('getGoalById', 'goal', error)
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

    if (db.isKnownUnavailable()) {
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('createGoal', 'goal', error)
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

    if (db.isKnownUnavailable()) {
      return saveToFallback()
    }

    try {
      const existing = await prisma.goal.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return saveToFallback()
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
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('updateGoal', 'goal', error)
      }
      return saveToFallback()
    }
  },

  async deleteGoal(id: string, userId: string): Promise<boolean> {
    if (db.isKnownUnavailable()) {
      return getFallbackUserStore(userId).delete(id)
    }

    try {
      const existing = await prisma.goal.findFirst({
        where: { id, userId },
      })

      if (!existing) {
        return getFallbackUserStore(userId).delete(id)
      }

      await prisma.goal.delete({
        where: { id },
      })
      return true
    } catch (error) {
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('deleteGoal', 'goal', error)
      }
      return getFallbackUserStore(userId).delete(id)
    }
  },
}
