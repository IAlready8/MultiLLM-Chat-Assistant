import { afterEach, describe, expect, it, vi } from 'vitest'
const reconcile = vi.hoisted(() => vi.fn())
vi.mock('@/services/generation-service', () => ({ reconcileExpiredGenerations: reconcile }))
import { GET } from '@/app/api/cron/generations/route'
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })
describe('recovery scheduler authorization', () => {
  it('fails closed without configuration and rejects untrusted callers', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(new Request('http://localhost'))).status).toBe(503)
    vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret-for-test')
    expect((await GET(new Request('http://localhost', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
    expect(reconcile).not.toHaveBeenCalled()
  })
  it('recovers bounded batches under authenticated invocation', async () => {
    vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret-for-test')
    reconcile.mockResolvedValue({ recovered: 2, batchFull: false })
    const response = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer synthetic-cron-secret-for-test' } }))
    expect(await response.json()).toEqual({ recovered: 2, more: false })
  })
})
