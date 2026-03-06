const REDACTED = '[REDACTED]'
const TRUNCATED_SUFFIX = '...[truncated]'
const MAX_STRING_LENGTH = 300
const MAX_DEPTH = 4
const MAX_ARRAY_ITEMS = 20

const SENSITIVE_KEY_PATTERN =
  /(authorization|api[-_]?key|token|secret|password|cookie|signature|seed|database_url|connection|string|dsn|webhook)/i

const stringRedactors: Array<{
  pattern: RegExp
  replacement: string
}> = [
  {
    pattern: /(Bearer\s+)[^\s]+/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    pattern:
      /((?:api[_-]?key|token|secret|password|authorization|cookie|signature|seed)\s*[:=]\s*)([^,\s]+)/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    pattern:
      /([?&](?:api[_-]?key|token|secret|password|signature|code|state)=)[^&\s]+/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    pattern: /\b(?:postgres(?:ql)?|mysql|redis):\/\/\S+/gi,
    replacement: REDACTED,
  },
  {
    pattern: /\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]+/g,
    replacement: REDACTED,
  },
  {
    pattern: /\bwhsec_[A-Za-z0-9]+\b/g,
    replacement: REDACTED,
  },
  {
    pattern: /\bgh[opusr]_[A-Za-z0-9]+\b/g,
    replacement: REDACTED,
  },
]

const truncateString = (value: string): string => {
  if (value.length <= MAX_STRING_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED_SUFFIX}`
}

export const sanitizeLogString = (value: string): string => {
  let sanitized = value
  for (const redactor of stringRedactors) {
    sanitized = sanitized.replace(redactor.pattern, redactor.replacement)
  }
  return truncateString(sanitized)
}

const sanitizeObject = (
  value: Record<string, unknown>,
  depth: number
): Record<string, unknown> => {
  if (depth >= MAX_DEPTH) {
    return { summary: '[Truncated object depth]' }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED]
      }
      return [key, sanitizeLogValue(entryValue, depth + 1)]
    })
  )
}

export const sanitizeLogValue = (value: unknown, depth = 0): unknown => {
  if (value == null) {
    return value
  }

  if (typeof value === 'string') {
    return sanitizeLogString(value)
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogString(value.message),
      stack: value.stack ? sanitizeLogString(value.stack) : undefined,
    }
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_ITEMS)
    return limited.map((entry) => sanitizeLogValue(entry, depth + 1))
  }

  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>, depth)
  }

  return sanitizeLogString(String(value))
}

export const summarizeErrorForLogs = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return sanitizeLogValue(error) as Record<string, unknown>
  }

  return {
    message: sanitizeLogValue(String(error)),
  }
}

