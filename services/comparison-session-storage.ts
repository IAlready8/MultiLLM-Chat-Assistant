export type ComparisonResponseSample = {
  model: string
  provider: string
  content: string
}

export type ComparisonSession = {
  id: string
  title: string
  prompt: string
  responses: ComparisonResponseSample[]
  sourceConversationId?: string
  createdAt: string
  updatedAt: string
}

export type NewComparisonSession = {
  title: string
  prompt: string
  responses: ComparisonResponseSample[]
  sourceConversationId?: string
}

const STORAGE_KEY = 'comparisonSessions'

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `comparison-${crypto.randomUUID()}`
  }
  return `comparison-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const readRawSessions = (): ComparisonSession[] => {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((session): session is ComparisonSession => {
      return (
        typeof session?.id === 'string' &&
        typeof session?.title === 'string' &&
        typeof session?.prompt === 'string' &&
        Array.isArray(session?.responses)
      )
    })
  } catch {
    return []
  }
}

const writeSessions = (sessions: ComparisonSession[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export const loadComparisonSessions = (): ComparisonSession[] =>
  readRawSessions().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

export const saveComparisonSession = (
  input: NewComparisonSession
): ComparisonSession => {
  const now = new Date().toISOString()
  const session: ComparisonSession = {
    id: createId(),
    title: input.title,
    prompt: input.prompt,
    responses: input.responses,
    sourceConversationId: input.sourceConversationId,
    createdAt: now,
    updatedAt: now,
  }

  writeSessions([session, ...loadComparisonSessions()])
  return session
}

export const deleteComparisonSession = (sessionId: string) => {
  writeSessions(loadComparisonSessions().filter(session => session.id !== sessionId))
}

export const COMPARISON_SESSIONS_STORAGE_KEY = STORAGE_KEY
