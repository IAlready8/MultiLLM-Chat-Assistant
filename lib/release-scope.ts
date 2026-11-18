/** V1 exclusions are release policy, not operator-configurable feature flags. */
const deferredPaths = [
  '/ai-roundtable',
  '/pipeline',
  '/goal-hub',
  '/api/goals',
  '/api/teams',
  '/api/jev',
  '/api/llm/decisions',
]

export function isDeferredReleasePath(pathname: string): boolean {
  return deferredPaths.some(path => pathname === path || pathname.startsWith(path + '/'))
}

export function deferredReleaseResponse(): Response {
  return Response.json(
    { error: 'This feature is unavailable in this release.', code: 'FEATURE_UNAVAILABLE' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const MAX_COMPARISON_MODELS = 4
