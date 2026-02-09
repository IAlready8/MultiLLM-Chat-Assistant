import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createDbAvailabilityTracker,
  getOrCreateUserStore,
  getErrorMessage,
  isDatabaseUnavailableError,
} from '@/lib/db-fallback'

describe('db-fallback', () => {
  describe('getErrorMessage', () => {
    it('extracts message from Error instances', () => {
      expect(getErrorMessage(new Error('test error'))).toBe('test error')
    })

    it('extracts message from plain objects', () => {
      expect(getErrorMessage({ message: 'plain object error' })).toBe(
        'plain object error'
      )
    })

    it('returns empty string for non-objects', () => {
      expect(getErrorMessage(42)).toBe('')
      expect(getErrorMessage(null)).toBe('')
      expect(getErrorMessage(undefined)).toBe('')
    })
  })

  describe('isDatabaseUnavailableError', () => {
    it('detects "Database access for" errors', () => {
      expect(
        isDatabaseUnavailableError(
          new Error('Database access for users is not available in this environment.')
        )
      ).toBe(true)
    })

    it('detects "Database access is not available" errors', () => {
      expect(
        isDatabaseUnavailableError(
          new Error('Database access is not available')
        )
      ).toBe(true)
    })

    it('returns false for non-database errors', () => {
      expect(isDatabaseUnavailableError(new Error('Connection refused'))).toBe(
        false
      )
    })
  })

  describe('createDbAvailabilityTracker', () => {
    let tracker: ReturnType<typeof createDbAvailabilityTracker>

    beforeEach(() => {
      tracker = createDbAvailabilityTracker()
    })

    it('starts as available', () => {
      expect(tracker.isKnownUnavailable()).toBe(false)
    })

    it('marks as unavailable for database errors', () => {
      const error = new Error(
        'Database access for providerConfig is not available in this environment.'
      )
      expect(tracker.markUnavailableIfNeeded(error)).toBe(true)
      expect(tracker.isKnownUnavailable()).toBe(true)
    })

    it('does not mark unavailable for non-database errors', () => {
      const error = new Error('Connection timed out')
      expect(tracker.markUnavailableIfNeeded(error)).toBe(false)
      expect(tracker.isKnownUnavailable()).toBe(false)
    })

    it('retries after interval elapses', () => {
      const error = new Error(
        'Database access for providerConfig is not available in this environment.'
      )
      tracker.markUnavailableIfNeeded(error)
      expect(tracker.isKnownUnavailable()).toBe(true)

      // Simulate time passing beyond retry interval (60s)
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
      expect(tracker.isKnownUnavailable()).toBe(false)

      vi.restoreAllMocks()
    })

    it('logs warning only once per scope', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = new Error('some DB error')

      tracker.logWarningOnce('testScope', 'test', error)
      tracker.logWarningOnce('testScope', 'test', error)
      tracker.logWarningOnce('testScope', 'test', error)

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('testScope')
      )

      consoleSpy.mockRestore()
    })

    it('logs different scopes independently', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = new Error('some DB error')

      tracker.logWarningOnce('scopeA', 'test', error)
      tracker.logWarningOnce('scopeB', 'test', error)

      expect(consoleSpy).toHaveBeenCalledTimes(2)

      consoleSpy.mockRestore()
    })
  })

  describe('getOrCreateUserStore', () => {
    it('creates a new store for unknown users', () => {
      const parent = new Map<string, Map<string, string>>()
      const store = getOrCreateUserStore(parent, 'user-1')

      expect(store).toBeInstanceOf(Map)
      expect(parent.has('user-1')).toBe(true)
    })

    it('returns existing store for known users', () => {
      const parent = new Map<string, Map<string, string>>()
      const first = getOrCreateUserStore(parent, 'user-1')
      first.set('key', 'value')

      const second = getOrCreateUserStore(parent, 'user-1')
      expect(second.get('key')).toBe('value')
      expect(first).toBe(second)
    })

    it('evicts oldest entry when exceeding maxUsers', () => {
      const parent = new Map<string, Map<string, string>>()

      // Fill to capacity
      for (let i = 0; i < 3; i++) {
        getOrCreateUserStore(parent, `user-${i}`, 3)
      }
      expect(parent.size).toBe(3)

      // Adding a 4th should evict user-0
      getOrCreateUserStore(parent, 'user-new', 3)
      expect(parent.size).toBe(3)
      expect(parent.has('user-0')).toBe(false)
      expect(parent.has('user-new')).toBe(true)
    })

    it('does not evict when accessing existing users', () => {
      const parent = new Map<string, Map<string, string>>()

      for (let i = 0; i < 3; i++) {
        getOrCreateUserStore(parent, `user-${i}`, 3)
      }

      // Accessing existing user should not evict
      getOrCreateUserStore(parent, 'user-0', 3)
      expect(parent.size).toBe(3)
      expect(parent.has('user-0')).toBe(true)
    })
  })
})
