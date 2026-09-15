// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { analytics: database } }))

import {
  AuthenticationError, BaseAppError, DatabaseError, ErrorCategory,
  ErrorSeverity, LLMProviderError, NetworkError, RateLimitError, ValidationError,
  createErrorContext, errorManager, isAppError,
} from '@/lib/error-system'
import { logger } from '@/lib/logger'

describe('error recovery and diagnostics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    database.create.mockReset().mockResolvedValue({})
    database.findMany.mockReset().mockResolvedValue([])
  })

  it('records critical errors without persisting credentials from their messages', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await errorManager.logError(new DatabaseError(
      'postgresql://user:private-password@host/db token=private-token',
      createErrorContext('/api/test', 'test-user'),
    ))
    expect(database.create).toHaveBeenCalledOnce()
    const data = database.create.mock.calls[0][0].data
    expect(data.userId).toBe('test-user')
    expect(data.payload).not.toContain('private-')
    expect(data.payload).toContain('[REDACTED]')
  })

  it('reports persistence outages safely without masking the original application failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    database.create.mockRejectedValueOnce(new Error('token=private-token'))
    await expect(errorManager.logError(new DatabaseError('offline', createErrorContext('/api/test'))))
      .resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('error_analytics_persistence_failed', expect.any(Object))
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-token')
  })

  it('falls back safely when the primary logger itself fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => { throw new Error('token=private-log-token') })
    const fallback = vi.spyOn(console, 'error').mockImplementation(() => {})
    await errorManager.logError(new Error('password=private-password'))
    expect(JSON.stringify(fallback.mock.calls)).not.toContain('private-')
    expect(JSON.stringify(fallback.mock.calls)).toContain('error_system_log_failure')
  })

  it('counts only well-formed error categories and severities', async () => {
    const valid = { code: 'DB_FAILURE', category: 'database', severity: 'critical' }
    database.findMany.mockResolvedValue([
      { payload: JSON.stringify(valid) }, { payload: JSON.stringify(valid) },
      { payload: JSON.stringify({ ...valid, category: '__proto__' }) },
      { payload: JSON.stringify({ ...valid, severity: 'unknown' }) },
      { payload: JSON.stringify({ ...valid, code: { invalid: true } }) },
      { payload: 'invalid-json' }, { payload: null }, { payload: 'null' },
    ])
    const stats = await errorManager.getErrorStats({ from: new Date(0), to: new Date() })
    expect(stats.total).toBe(2)
    expect(stats.byCategory.database).toBe(2)
    expect(stats.bySeverity.critical).toBe(2)
    expect(stats.topErrors).toEqual([{ code: 'DB_FAILURE', count: 2 }])
  })

  it('returns empty statistics when analytics is unavailable', async () => {
    database.findMany.mockRejectedValueOnce(new Error('offline'))
    expect((await errorManager.getErrorStats({ from: new Date(0), to: new Date() })).total).toBe(0)
  })

  it('limits recovery attempts and associates them with the failing subsystem', async () => {
    const context = createErrorContext('/api/test')
    for (const [error, expected] of [
      [new NetworkError('offline', context), 'retry'],
      [new LLMProviderError('Google', 'busy', context), 'switch_provider'],
      [new DatabaseError('offline', context), 'retry'],
    ] as const) {
      for (let index = 0; index < error.maxRetries; index++) {
        expect(await errorManager.attemptRecovery(error)).toMatchObject({ success: true, action: { type: expected } })
      }
      expect(await errorManager.attemptRecovery(error)).toMatchObject({ success: false })
    }
    for (const error of [new AuthenticationError('denied', context), new ValidationError('bad', 'email', context)]) {
      expect(isAppError(error)).toBe(true)
      expect(await errorManager.attemptRecovery(error)).toMatchObject({ success: false })
      expect(errorManager.createUserFriendlyMessage(error)).toBe(error.userMessage)
    }
    expect(isAppError(new Error('ordinary'))).toBe(false)
  })

  it('honors rate-limit retry delays without performing an automatic request', async () => {
    const context = createErrorContext('/api/test')
    for (const error of [new RateLimitError(2500, context), new RateLimitError('busy', 2500, context)]) {
      expect(await errorManager.attemptRecovery(error)).toMatchObject({ action: { type: 'retry', payload: { delay: 2500 } } })
      expect(await errorManager.attemptRecovery(error)).toMatchObject({ success: false })
    }
    const unknown = new BaseAppError('OTHER', ErrorCategory.UNKNOWN, ErrorSeverity.LOW, 'other', 'Try later', context, true)
    expect(await errorManager.attemptRecovery(unknown)).toMatchObject({ success: false })
  })
})
