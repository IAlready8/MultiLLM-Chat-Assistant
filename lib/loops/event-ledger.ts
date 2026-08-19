import { randomUUID } from 'node:crypto'
import type { LoopEvent } from '@/lib/loops/types'
import {
  getParsedAnalyticsEvents,
  recordAnalyticsEvent,
} from '@/services/analytics-service'

const REDACTED = '[REDACTED]'
const secretKeyNames = new Set([
  'apikey',
  'password',
  'secret',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'authorization',
  'cookie',
  'credential',
  'credentials',
])

const isSecretKey = (key: string): boolean =>
  secretKeyNames.has(key.replaceAll('-', '').replaceAll('_', '').toLowerCase())

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 6) {
    return '[MAX_DEPTH]'
  }

  if (typeof value === 'string') {
    return value.length > 4000 ? `${value.slice(0, 4000)}…` : value
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 100)
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [
        key,
        isSecretKey(key)
          ? REDACTED
          : sanitizeValue(nestedValue, depth + 1),
      ])
    )
  }

  return String(value)
}

export interface LoopEventLedgerOptions {
  actorUserId: string
  loopId: string
  runId?: string
}

export interface StoredLoopEvent {
  runId: string
  loopId: string
  eventType: LoopEvent['type']
  iteration: number
  occurredAt: string
  payload: Record<string, unknown>
}

export interface LoopRunSummary {
  runId: string
  loopId: string
  status: string
  startedAt: string
  completedAt?: string
  iterations: number
  tokenUsage: number
  estimatedCostUsd: number
  summary?: string
}

export function createLoopEventLedger({
  actorUserId,
  loopId,
  runId = randomUUID(),
}: LoopEventLedgerOptions) {
  const eventSink = async (event: LoopEvent): Promise<void> => {
    await recordAnalyticsEvent({
      event: 'loop_event',
      userId: actorUserId,
      createdAt: new Date(event.occurredAt),
      payload: {
        runId,
        loopId,
        eventType: event.type,
        iteration: event.iteration,
        occurredAt: event.occurredAt,
        payload: sanitizeValue(event.payload),
      },
    })
  }

  return { runId, eventSink }
}

const isStoredLoopEvent = (
  payload: Record<string, unknown>
): payload is Record<string, unknown> & StoredLoopEvent =>
  typeof payload.runId === 'string' &&
  typeof payload.loopId === 'string' &&
  typeof payload.eventType === 'string' &&
  typeof payload.iteration === 'number' &&
  typeof payload.occurredAt === 'string' &&
  typeof payload.payload === 'object' &&
  payload.payload !== null

export async function getRecentLoopRuns(
  actorUserId: string,
  options: { loopId?: string; limit?: number; days?: number } = {}
): Promise<LoopRunSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const events = await getParsedAnalyticsEvents(
    actorUserId,
    Math.min(Math.max(options.days ?? 30, 1), 365)
  )

  const byRun = new Map<string, StoredLoopEvent[]>()
  for (const event of events) {
    if (event.event !== 'loop_event' || !isStoredLoopEvent(event.payload)) {
      continue
    }
    if (options.loopId && event.payload.loopId !== options.loopId) {
      continue
    }

    const storedEvent: StoredLoopEvent = {
      runId: event.payload.runId,
      loopId: event.payload.loopId,
      eventType: event.payload.eventType,
      iteration: event.payload.iteration,
      occurredAt: event.payload.occurredAt,
      payload: event.payload.payload as Record<string, unknown>,
    }
    const existing = byRun.get(storedEvent.runId) ?? []
    existing.push(storedEvent)
    byRun.set(storedEvent.runId, existing)
  }

  return [...byRun.values()]
    .map((runEvents): LoopRunSummary => {
      const ordered = [...runEvents].sort((a, b) =>
        a.occurredAt.localeCompare(b.occurredAt)
      )
      const started = ordered.find((event) => event.eventType === 'RUN_STARTED')
      const finished = ordered.findLast(
        (event) => event.eventType === 'RUN_FINISHED'
      )
      const last = finished ?? ordered[ordered.length - 1]

      return {
        runId: last.runId,
        loopId: last.loopId,
        status:
          typeof finished?.payload.finalState === 'string'
            ? finished.payload.finalState
            : 'RUNNING',
        startedAt: started?.occurredAt ?? ordered[0].occurredAt,
        completedAt: finished?.occurredAt,
        iterations: Math.max(...ordered.map((event) => event.iteration)),
        tokenUsage:
          typeof finished?.payload.tokenUsage === 'number'
            ? finished.payload.tokenUsage
            : 0,
        estimatedCostUsd:
          typeof finished?.payload.estimatedCostUsd === 'number'
            ? finished.payload.estimatedCostUsd
            : 0,
        summary:
          typeof finished?.payload.summary === 'string'
            ? finished.payload.summary
            : undefined,
      }
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
}
