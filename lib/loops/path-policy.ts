import { posix } from 'node:path'

export class LoopPolicyViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoopPolicyViolation'
  }
}

const forbiddenPrefixes = ['.git', '.env', 'node_modules', '.next']

export function normalizeRepositoryPath(input: string): string {
  const value = input.trim().replaceAll('\\', '/')

  if (!value) {
    throw new LoopPolicyViolation('Repository path cannot be empty.')
  }

  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
    throw new LoopPolicyViolation(`Absolute paths are forbidden: ${input}`)
  }

  const rawSegments = value.split('/')
  if (rawSegments.some((segment) => segment === '..')) {
    throw new LoopPolicyViolation(`Path traversal is forbidden: ${input}`)
  }

  const normalized = posix.normalize(value).replace(/^\.\//, '')
  if (!normalized || normalized === '.') {
    throw new LoopPolicyViolation(`Invalid repository path: ${input}`)
  }

  const forbidden = forbiddenPrefixes.find(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  )
  if (forbidden) {
    throw new LoopPolicyViolation(
      `Sensitive or generated path is forbidden: ${normalized}`
    )
  }

  return normalized
}

const normalizePattern = (pattern: string): string => {
  const trimmed = pattern.trim().replaceAll('\\', '/')
  const withoutGlob = trimmed.endsWith('/**') ? trimmed.slice(0, -3) : trimmed
  return normalizeRepositoryPath(withoutGlob)
}

export function isRepositoryPathAllowed(
  input: string,
  allowedPatterns: string[]
): boolean {
  const path = normalizeRepositoryPath(input)

  return allowedPatterns.some((pattern) => {
    const normalizedPattern = normalizePattern(pattern)
    return path === normalizedPattern || path.startsWith(`${normalizedPattern}/`)
  })
}

export function assertRepositoryPathAllowed(
  input: string,
  allowedPatterns: string[],
  operation: 'read' | 'write' | 'delete'
): string {
  const path = normalizeRepositoryPath(input)

  if (!isRepositoryPathAllowed(path, allowedPatterns)) {
    throw new LoopPolicyViolation(
      `${operation} is outside the configured repository scope: ${path}`
    )
  }

  return path
}
