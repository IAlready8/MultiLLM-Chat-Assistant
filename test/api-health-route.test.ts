import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockQueryRaw = vi.fn()
const mockMetricsSnapshot = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

vi.mock('@/lib/api-logger', () => ({
  metrics: {
    snapshot: () => mockMetricsSnapshot(),
  },
}))

import { GET } from '@/app/api/health/route'

describe('/api/health route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRaw.mockResolvedValue([{ ok: 1 }])
    mockMetricsSnapshot.mockReturnValue({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {},
    })
  })

  it('returns healthy status when database check succeeds', async () => {
    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('healthy')
    expect(payload.checks.database.status).toBe('connected')
    expect(payload.metrics).toBeUndefined()
  })

  it('returns degraded status when database check fails', async () => {
    mockQueryRaw.mockRejectedValue(
      new Error('Database access is not available in this environment.')
    )

    const request = new NextRequest('http://localhost/api/health')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('degraded')
    expect(payload.checks.database.status).toBe('degraded')
    expect(payload.checks.database.message).toContain('in-memory fallback')
  })

  it('includes metrics snapshot when metrics=1 query is provided', async () => {
    mockMetricsSnapshot.mockReturnValue({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {
        'GET /api/config': {
          total: 3,
          errors: 0,
          avgMs: 12,
          statusCodes: { '200': 3 },
        },
      },
    })

    const request = new NextRequest('http://localhost/api/health?metrics=1')
    const response = await GET(request)

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe('healthy')
    expect(payload.metrics).toEqual({
      startedAt: '2026-01-01T00:00:00.000Z',
      routes: {
        'GET /api/config': {
          total: 3,
          errors: 0,
          avgMs: 12,
          statusCodes: { '200': 3 },
        },
      },
    })
  })
})

