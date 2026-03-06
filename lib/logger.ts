import { sanitizeLogValue } from '@/lib/log-sanitizer'

type Level = 'info' | 'warn' | 'error'

function log(level: Level, event: string, data?: Record<string, any>) {
  const entry = sanitizeLogValue({
    ts: new Date().toISOString(),
    level,
    event: String(sanitizeLogValue(event)),
    ...(data ?? {}),
  })
  console[level](JSON.stringify(entry))
}

export const logger = {
  info: (event: string, data?: Record<string, any>) => log('info', event, data),
  warn: (event: string, data?: Record<string, any>) => log('warn', event, data),
  error: (event: string, data?: Record<string, any>) => log('error', event, data),
}
