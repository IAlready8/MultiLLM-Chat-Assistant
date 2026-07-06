import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRecordAnalyticsEvent = vi.fn()
const mockGetParsedAnalyticsEvents = vi.fn()

vi.mock('@/services/analytics-service', () => ({
  recordAnalyticsEvent: (...args: unknown[]) =>
    mockRecordAnalyticsEvent(...args),
  getParsedAnalyticsEvents: (...args: unknown[]) =>
    mockGetParsedAnalyticsEvents(...args),
}))

import {
  createLoopEventLedger,
  getRecentLoopRuns,
} from '@/lib/loops/event-ledger'

describe('loop event ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordAnalyticsEvent.mockResolvedValue(undefined)
    mockGetParsedAnalyticsEvents.mockResolvedValue([])
  })

  it('persists events with a stable run ID and redacts secret-like keys', async () => {
    const ledger = createLoopEventLedger({
      actorUserId: 'admin-1',
      loopId: 'provider-registry-audit',
      runId: 'run-1',
    })

    await ledger.eventSink({
      type: 'WORKER_FINISHED',
      iteration: 1,
      occurredAt: '2026-07-06T02:45:00.000Z',
      payload: {
        summary: 'Checked provider configuration.',
        apiKey: 'must-not-be-stored',
        nested: {
          authorization: 'Bearer hidden',
          safe: 'retained',
        },
      },
    })

    expect(ledger.runId).toBe('run-1')
    expect(mockRecordAnalyticsEvent).toHaveBeenCalledWith({
      event: 'loop_event',
      userId: 'admin-1',
      createdAt: new Date('2026-07-06T02:45:00.000Z'),
      payload: {
        runId: 'run-1',
        loopId: 'provider-registry-audit',
        eventType: 'WORKER_FINISHED',
        iteration: 1,
        occurredAt: '2026-07-06T02:45:00.000Z',
        payload: {
          summary: 'Checked provider configuration.',
          apiKey: '[REDACTED]',
          nested: {
            authorization: '[REDACTED]',
            safe: 'retained',
          },
        },
      },
    })
  })

  it('groups stored events into recent run summaries', async () => {
    mockGetParsedAnalyticsEvents.mockResolvedValue([
      {
        event: 'loop_event',
        userId: 'admin-1',
        createdAt: new Date('2026-07-06T02:45:00.000Z'),
        payload: {
          runId: 'run-1',
          loopId: 'provider-registry-audit',
          eventType: 'RUN_STARTED',
          iteration: 0,
          occurredAt: '2026-07-06T02:45:00.000Z',
          payload: { goal: 'Audit providers' },
        },
      },
      {
        event: 'loop_event',
        userId: 'admin-1',
        createdAt: new Date('2026-07-06T02:45:02.000Z'),
        payload: {
          runId: 'run-1',
          loopId: 'provider-registry-audit',
          eventType: 'RUN_FINISHED',
          iteration: 1,
          occurredAt: '2026-07-06T02:45:02.000Z',
          payload: {
            finalState: 'COMPLETE',
            summary: 'Provider registries match.',
            tokenUsage: 0,
            estimatedCostUsd: 0,
          },
        },
      },
      {
        event: 'unrelated_event',
        userId: 'admin-1',
        createdAt: new Date('2026-07-06T02:45:03.000Z'),
        payload: {},
      },
    ])

    const runs = await getRecentLoopRuns('admin-1', {
      loopId: 'provider-registry-audit',
      limit: 10,
      days: 7,
    })

    expect(mockGetParsedAnalyticsEvents).toHaveBeenCalledWith('admin-1', 7)
    expect(runs).toEqual([
      {
        runId: 'run-1',
        loopId: 'provider-registry-audit',
        status: 'COMPLETE',
        startedAt: '2026-07-06T02:45:00.000Z',
        completedAt: '2026-07-06T02:45:02.000Z',
        iterations: 1,
        tokenUsage: 0,
        estimatedCostUsd: 0,
        summary: 'Provider registries match.',
      },
    ])
  })
})
