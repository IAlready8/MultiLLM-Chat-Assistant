import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Authorization policy P3: only the fresh database read in lib/api-auth.ts
// authorizes. The JWT/session role is display-only and currently has no
// consumer in the current source review. This heuristic catches common
// single-line session/token role reads. Aliases, computed properties and
// multiline expressions can escape it, so authorization changes also require
// explicit review. The known display gap (session.user.role can show MEMBER
// for a persisted ADMIN/OWNER) must not become an authorization path.

const ROOT = path.resolve(__dirname, '..')

// lib/auth.ts produces token.role/session.user.role; types/next-auth.d.ts
// declares it. Neither consumes it for a decision.
const ALLOWED_FILES = new Set(['lib/auth.ts', 'types/next-auth.d.ts'])

const SKIPPED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'coverage',
  'test',
  'tests',
  'e2e',
  '__tests__',
  'playwright-report',
  'test-results',
  'out',
  'dist',
])

const ROLE_READ_PATTERNS: RegExp[] = [
  /\b(?:session|token|jwt)\s*\??\.\s*role\b/,
  /\.\s*user\s*\??\.\s*role\b/,
  /\b(?:session|token|jwt)\s*\??\.\s*user\s*\??\.\s*role\b/,
  /\{\s*[^}]*\brole\b[^}]*\}\s*=\s*(?:await\s+)?(?:session|token|jwt)\b/,
  /\{\s*[^}]*\brole\b[^}]*\}\s*=\s*[\w$.?]*\.user\b/,
]

const isCommentLine = (line: string): boolean => {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

export const findRoleReads = (source: string): string[] =>
  source
    .split('\n')
    .filter((line) => !isCommentLine(line))
    .filter((line) => ROLE_READ_PATTERNS.some((pattern) => pattern.test(line)))
    .map((line) => line.trim())

const collectSourceFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      collectSourceFiles(full, out)
    } else if (
      /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry) &&
      !entry.endsWith('.d.ts.map')
    ) {
      out.push(full)
    }
  }
  return out
}

describe('session role consumers (P3 guard)', () => {
  it('detects role reads off sessions, tokens and session users', () => {
    expect(findRoleReads('if (session.user.role === "ADMIN") {')).toHaveLength(1)
    expect(findRoleReads('const r = data?.user?.role')).toHaveLength(1)
    expect(findRoleReads('return token.role')).toHaveLength(1)
    expect(findRoleReads('const { role } = session.user')).toHaveLength(1)
    expect(findRoleReads('const { id, role } = await session')).toHaveLength(1)
  })

  it('ignores message roles and fresh-read user roles', () => {
    expect(findRoleReads("message.role === 'user'")).toHaveLength(0)
    expect(findRoleReads("if (user.role !== 'OWNER' && user.role !== 'ADMIN') {")).toHaveLength(0)
    expect(findRoleReads('role: resolveAuthTeamRole(currentUser.email, currentUser.role),')).toHaveLength(0)
  })

  it('ignores comment lines that mention the session role', () => {
    expect(findRoleReads(' * lib/auth.ts derives session.user.role from the allowlists')).toHaveLength(0)
    expect(findRoleReads('// session.user.role is display-only')).toHaveLength(0)
    expect(findRoleReads('/* token.role */')).toHaveLength(0)
  })

  it('finds no consumer of the session/JWT role outside its producer and declaration', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(ROOT)) {
      const relative = path.relative(ROOT, file).split(path.sep).join('/')
      if (ALLOWED_FILES.has(relative)) continue
      for (const line of findRoleReads(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative}: ${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
