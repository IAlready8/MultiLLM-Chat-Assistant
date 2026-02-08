export type GoalSubtask = {
  id: string
  title: string
  completed: boolean
}

export type GoalDetails = {
  plainDescription: string | null
  dueDate: string | null
  subtasks: GoalSubtask[]
}

const META_PREFIX = '<!--goal-meta:'
const META_SUFFIX = '-->'

const normalizeSubtasks = (value: unknown): GoalSubtask[] => {
  if (!Array.isArray(value)) return []
  const subtasks: GoalSubtask[] = []

  for (const item of value) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { id?: unknown }).id !== 'string' ||
      typeof (item as { title?: unknown }).title !== 'string'
    ) {
      continue
    }

    const title = (item as { title: string }).title.trim()
    if (!title) continue

    subtasks.push({
      id: (item as { id: string }).id,
      title,
      completed: Boolean((item as { completed?: unknown }).completed),
    })
  }

  return subtasks
}

const normalizeDueDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

export const parseGoalDetails = (description: string | null | undefined): GoalDetails => {
  if (!description) {
    return {
      plainDescription: null,
      dueDate: null,
      subtasks: [],
    }
  }

  const metaStart = description.lastIndexOf(META_PREFIX)
  const hasMeta = metaStart >= 0 && description.endsWith(META_SUFFIX)
  if (!hasMeta) {
    return {
      plainDescription: description.trim() || null,
      dueDate: null,
      subtasks: [],
    }
  }

  const plainText = description.slice(0, metaStart).trim()
  const rawJson = description
    .slice(metaStart + META_PREFIX.length, description.length - META_SUFFIX.length)
    .trim()

  try {
    const parsed = JSON.parse(rawJson) as {
      dueDate?: unknown
      subtasks?: unknown
    }
    return {
      plainDescription: plainText || null,
      dueDate: normalizeDueDate(parsed.dueDate),
      subtasks: normalizeSubtasks(parsed.subtasks),
    }
  } catch {
    return {
      plainDescription: description.trim() || null,
      dueDate: null,
      subtasks: [],
    }
  }
}

export const encodeGoalDescription = (
  plainDescription: string | null | undefined,
  metadata?: {
    dueDate?: string | null
    subtasks?: GoalSubtask[]
  }
): string | null => {
  const description = plainDescription?.trim() || ''
  const dueDate = normalizeDueDate(metadata?.dueDate)
  const subtasks = normalizeSubtasks(metadata?.subtasks || [])

  const hasMeta = Boolean(dueDate) || subtasks.length > 0
  if (!hasMeta) {
    return description || null
  }

  const payload = JSON.stringify({
    dueDate,
    subtasks,
  })

  if (!description) {
    return `${META_PREFIX}${payload}${META_SUFFIX}`
  }

  return `${description}\n${META_PREFIX}${payload}${META_SUFFIX}`
}
