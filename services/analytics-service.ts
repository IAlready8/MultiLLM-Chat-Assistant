import prisma from '@/lib/prisma'
import type { Analytics as AnalyticsRecord } from '@/types/prisma'
import { getUserProviderConfigCount } from '@/lib/api-key-service'
import {
  assertInMemoryFallbackAllowed,
  createDbAvailabilityTracker,
} from '@/lib/db-fallback'
import { PersonaService } from '@/services/persona-service.db'
import { ConversationService } from '@/services/conversation-service.db'

export interface AnalyticsEvent {
  event: string
  payload?: Record<string, unknown>
  userId: string
  createdAt?: Date
}

export interface UsageData {
  provider: string
  requests: number
  tokens: number
  errors: number
  avgResponseTime: number
  date?: string
}

export interface ParsedAnalyticsEvent {
  event: string
  userId: string
  createdAt: Date
  payload: Record<string, unknown>
}

export interface WorkflowMetrics {
  configuredProviders: number
  personas: number
  comparisonReadyConversations: number
  weeklySavedBriefComparisons: number
  conversationsCreated: number
  comparisonViews: number
  analyticsViews: number
}

type StoredAnalyticsEvent = {
  id: string
  event: string
  payload: string | null
  createdAt: Date
  userId: string
}

type GlobalAnalyticsFallback = typeof globalThis & {
  __multiLlmAnalyticsFallbackStore?: Map<string, StoredAnalyticsEvent[]>
}

const analyticsGlobal = globalThis as GlobalAnalyticsFallback
const fallbackEvents =
  analyticsGlobal.__multiLlmAnalyticsFallbackStore ??
  (analyticsGlobal.__multiLlmAnalyticsFallbackStore = new Map())

const db = createDbAvailabilityTracker()

const createFallbackId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `analytics-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const parsePayload = (value: string | null): Record<string, unknown> => {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const saveFallbackEvent = (event: AnalyticsEvent) => {
  assertInMemoryFallbackAllowed('analytics events')

  const stored: StoredAnalyticsEvent = {
    id: createFallbackId(),
    event: event.event,
    payload: JSON.stringify(event.payload || {}),
    createdAt: event.createdAt ?? new Date(),
    userId: event.userId,
  }

  const existing = fallbackEvents.get(event.userId) ?? []
  existing.push(stored)
  fallbackEvents.set(event.userId, existing.slice(-2000))
}

const loadFallbackEvents = (
  userId?: string,
  startDate?: Date
): StoredAnalyticsEvent[] => {
  const collections = userId
    ? [fallbackEvents.get(userId) ?? []]
    : Array.from(fallbackEvents.values())

  return collections
    .flat()
    .filter((event) => !startDate || event.createdAt >= startDate)
}

const parseNumeric = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const estimateTokenCount = (payload: Record<string, unknown>): number => {
  const direct =
    parseNumeric(payload.tokens) ||
    parseNumeric(payload.total_tokens) ||
    parseNumeric(payload.totalTokens)

  if (direct > 0) {
    return Math.round(direct)
  }

  const promptTokens =
    parseNumeric(payload.prompt_tokens) || parseNumeric(payload.promptTokens)
  const completionTokens =
    parseNumeric(payload.completion_tokens) ||
    parseNumeric(payload.completionTokens)

  if (promptTokens > 0 || completionTokens > 0) {
    return Math.round(promptTokens + completionTokens)
  }

  const text = typeof payload.content === 'string' ? payload.content : ''
  return text ? Math.max(1, Math.round(text.length / 4)) : 0
}

const extractResponseTime = (payload: Record<string, unknown>): number => {
  return (
    parseNumeric(payload.responseTime) ||
    parseNumeric(payload.response_time) ||
    parseNumeric(payload.responseTimeMs) ||
    parseNumeric(payload.latency)
  )
}

const aggregateUsage = (
  events: ParsedAnalyticsEvent[],
  bucketByDate = false
): UsageData[] => {
  const map = new Map<
    string,
    UsageData & { responseTimeSum: number; responseSamples: number }
  >()

  for (const event of events) {
    const provider = String(event.payload.provider || 'unknown')
    const date = bucketByDate ? event.createdAt.toISOString().split('T')[0] : undefined
    const key = bucketByDate ? `${date}:${provider}` : provider

    const existing = map.get(key) || {
      provider,
      requests: 0,
      tokens: 0,
      errors: 0,
      avgResponseTime: 0,
      date,
      responseTimeSum: 0,
      responseSamples: 0,
    }

    if (event.event === 'llm_request') {
      existing.requests += 1
      existing.tokens += estimateTokenCount(event.payload)
      const responseTime = extractResponseTime(event.payload)
      if (responseTime > 0) {
        existing.responseTimeSum += responseTime
        existing.responseSamples += 1
      }
    } else if (event.event === 'llm_error') {
      existing.errors += 1
    }

    map.set(key, existing)
  }

  return Array.from(map.values())
    .map(({ responseTimeSum, responseSamples, ...usage }) => ({
      ...usage,
      avgResponseTime:
        responseSamples > 0
          ? Math.round(responseTimeSum / responseSamples)
          : 0,
    }))
    .sort((a, b) => {
      if (bucketByDate) {
        if (a.date === b.date) {
          return b.requests - a.requests
        }
        return (a.date || '').localeCompare(b.date || '')
      }
      return b.requests - a.requests
    })
}

const loadStoredEvents = async (
  userId?: string,
  startDate?: Date
): Promise<StoredAnalyticsEvent[]> => {
  let dbEvents: StoredAnalyticsEvent[] = []

  if (!db.isKnownUnavailable()) {
    try {
      const analytics = await prisma.analytics.findMany({
        where: {
          ...(userId ? { userId } : {}),
          ...(startDate ? { createdAt: { gte: startDate } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      })
      dbEvents = analytics.map((event: AnalyticsRecord) => ({
        id: event.id,
        event: event.event,
        payload: event.payload as string | null,
        createdAt: event.createdAt,
        userId: event.userId,
      }))
    } catch (error) {
      if (!db.isFallbackAllowed()) {
        throw error
      }
      if (!db.markUnavailableIfNeeded(error)) {
        db.logWarningOnce('loadStoredEvents', 'analytics', error)
      }
    }
  }

  const memoryEvents = db.isFallbackAllowed()
    ? loadFallbackEvents(userId, startDate)
    : []
  const merged = [...dbEvents, ...memoryEvents]
  merged.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return merged
}

const toParsedEvents = (events: StoredAnalyticsEvent[]): ParsedAnalyticsEvent[] =>
  events.map((event) => ({
    event: event.event,
    userId: event.userId,
    createdAt: event.createdAt,
    payload: parsePayload(event.payload),
  }))

const countEvents = (
  events: ParsedAnalyticsEvent[],
  eventName: string
): number => events.filter((event) => event.event === eventName).length

export async function recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  const createdAt = event.createdAt ?? new Date()

  if (db.isKnownUnavailable()) {
    saveFallbackEvent({ ...event, createdAt })
    return
  }

  try {
    await prisma.analytics.create({
      data: {
        event: event.event,
        payload: JSON.stringify(event.payload || {}),
        userId: event.userId,
      },
    })
  } catch (error) {
    if (!db.isFallbackAllowed()) {
      throw error
    }
    if (!db.markUnavailableIfNeeded(error)) {
      db.logWarningOnce('recordAnalyticsEvent', 'analytics', error)
    }
    saveFallbackEvent({ ...event, createdAt })
  }
}

export async function getAnalytics(userId?: string): Promise<UsageData[]> {
  const events = await loadStoredEvents(userId)
  return aggregateUsage(toParsedEvents(events))
}

export async function getDailyUsage(
  userId?: string,
  days: number = 7
): Promise<UsageData[]> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const events = await loadStoredEvents(userId, startDate)
  return aggregateUsage(toParsedEvents(events), true)
}

export async function getParsedAnalyticsEvents(
  userId?: string,
  days?: number
): Promise<ParsedAnalyticsEvent[]> {
  const startDate =
    typeof days === 'number'
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined
  const events = await loadStoredEvents(userId, startDate)
  return toParsedEvents(events)
}

export async function getWorkflowMetrics(
  userId: string,
  days: number,
  events?: ParsedAnalyticsEvent[]
): Promise<WorkflowMetrics> {
  const parsedEvents = events ?? (await getParsedAnalyticsEvents(userId, days))
  const updatedSince = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [
    configuredProviders,
    personas,
    comparisonReadyConversations,
    weeklySavedBriefComparisons,
  ] = await Promise.all([
    getUserProviderConfigCount(userId),
    PersonaService.getPersonaCountByUserId(userId),
    ConversationService.getComparisonReadyConversationCountByUserId(userId),
    ConversationService.getWeeklySavedBriefComparisonCountByUserId(
      userId,
      updatedSince
    ),
  ])

  return {
    configuredProviders,
    personas,
    comparisonReadyConversations,
    weeklySavedBriefComparisons,
    conversationsCreated: countEvents(parsedEvents, 'conversation_created'),
    comparisonViews: countEvents(parsedEvents, 'comparison_viewed'),
    analyticsViews: countEvents(parsedEvents, 'analytics_viewed'),
  }
}
