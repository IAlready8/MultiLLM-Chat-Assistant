/**
 * Single-flight wrapper: while one call is running, every other caller waits
 * for that same result instead of starting its own.
 *
 * Nothing is cached after the call settles, so results are never stale. The
 * effect is a ceiling: however many requests arrive at once, at most one run
 * of the wrapped work is in flight per server instance.
 */
export const coalesce = <T>(run: () => Promise<T>): (() => Promise<T>) => {
  let inFlight: Promise<T> | null = null
  return () => {
    if (inFlight) return inFlight
    const current = (async () => run())().finally(() => {
      if (inFlight === current) inFlight = null
    })
    inFlight = current
    return current
  }
}
