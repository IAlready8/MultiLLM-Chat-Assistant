/**
 * Shared utilities for database-first + in-memory fallback pattern.
 *
 * Centralizes:
 *  - Error detection for stubbed/unavailable database
 *  - Retry-after-interval logic (prevents permanent one-way fallback)
 *  - Once-per-scope warning logging
 *  - Fallback store size limiting
 */

const DB_RETRY_INTERVAL_MS = 60_000
const DEFAULT_MAX_USERS = 100

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
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

export const isDatabaseUnavailableError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  return (
    message.includes('Database access for') ||
    message.includes('Database access is not available')
  )
}

const getErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code
  }
  return undefined
}

/**
 * Detects FK violations tied to the user relation (common when guest IDs
 * intentionally do not exist as persisted User rows).
 */
export const isUserForeignKeyConstraintError = (error: unknown): boolean => {
  const message = getErrorMessage(error)
  const code = getErrorCode(error)

  const metaString =
    typeof error === 'object' && error !== null && 'meta' in error
      ? JSON.stringify((error as { meta?: unknown }).meta)
      : ''

  const fieldHints = `${message} ${metaString}`.toLowerCase()
  const targetsUserRelation =
    fieldHints.includes('userid') ||
    fieldHints.includes('user_id') ||
    fieldHints.includes('_userid_fkey') ||
    fieldHints.includes('userid_fkey')

  const isForeignKeyViolation =
    code === 'P2003' || message.includes('Foreign key constraint failed')

  return isForeignKeyViolation && targetsUserRelation
}

export interface DbAvailabilityState {
  unavailable: boolean
  unavailableSince?: number
}

/**
 * Creates a scoped DB availability tracker with retry-after-interval.
 */
export function createDbAvailabilityTracker() {
  const state: DbAvailabilityState = { unavailable: false }
  const warnings = new Set<string>()

  return {
    isKnownUnavailable(): boolean {
      if (!state.unavailable) return false
      const since = state.unavailableSince ?? 0
      if (Date.now() - since > DB_RETRY_INTERVAL_MS) {
        state.unavailable = false
        state.unavailableSince = undefined
        warnings.clear()
        return false
      }
      return true
    },

    markUnavailableIfNeeded(error: unknown): boolean {
      if (isDatabaseUnavailableError(error)) {
        state.unavailable = true
        state.unavailableSince = Date.now()
        return true
      }
      return false
    },

    logWarningOnce(scope: string, label: string, error: unknown): void {
      if (warnings.has(scope)) return
      warnings.add(scope)
      const message = getErrorMessage(error) || 'unknown database error'
      console.warn(
        `Falling back to in-memory ${label} store for ${scope}: ${message}`
      )
    },
  }
}

/**
 * Returns or creates a per-user sub-map from the parent fallback store,
 * evicting the oldest entry if the store exceeds maxUsers.
 */
export function getOrCreateUserStore<V>(
  store: Map<string, Map<string, V>>,
  userId: string,
  maxUsers: number = DEFAULT_MAX_USERS
): Map<string, V> {
  let userStore = store.get(userId)
  if (!userStore) {
    if (store.size >= maxUsers) {
      const oldestKey = store.keys().next().value
      if (oldestKey !== undefined) {
        store.delete(oldestKey)
      }
    }
    userStore = new Map<string, V>()
    store.set(userId, userStore)
  }
  return userStore
}
