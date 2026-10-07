import { afterEach, describe, expect, it, vi } from 'vitest'

const tx = vi.hoisted(() => ({ $queryRaw: vi.fn(), rateLimitBucket: { findUnique: vi.fn(), upsert: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (run: (client: typeof tx) => unknown) => run(tx), $queryRaw: vi.fn() } }))
import { consumePostgresLimit } from '@/lib/postgres-rate-limit'

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs() })
const setup = (timestamps: bigint[]) => {
  tx.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([{ now: new Date(10_000) }])
  tx.rateLimitBucket.findUnique.mockResolvedValue({ timestamps })
}
describe('PostgreSQL sliding window protection', () => {
  it('expires old hits, preserves active hits and hashes identifiers', async () => {
    setup([5_000n, 9_000n])
    expect(await consumePostgresLimit('signin:user@example.test', { max: 2, windowMs: 2_000 })).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 })
    expect(tx.rateLimitBucket.upsert.mock.calls[0][0]).toMatchObject({ update: { timestamps: [9_000n, 10_000n], expiresAt: new Date(12_000) } })
    expect(tx.rateLimitBucket.upsert.mock.calls[0][0].where.id).toMatch(/^[a-f0-9]{64}$/)
  })
  it('does not extend the window on rejection', async () => {
    setup([9_000n, 9_500n])
    expect(await consumePostgresLimit('key', { max: 2, windowMs: 2_000 })).toEqual({ allowed: false, remaining: 0, retryAfterMs: 1_000 })
    expect(tx.rateLimitBucket.upsert).not.toHaveBeenCalled()
  })
  it('fails closed when the selected database backend fails', async () => {
    vi.stubEnv('RATE_LIMIT_BACKEND', 'postgres')
    tx.$queryRaw.mockRejectedValue(new Error('database offline'))
    const { checkAndConsume } = await import('@/lib/rate-limit')
    await expect(checkAndConsume('key', { max: 2, windowMs: 2_000 })).rejects.toMatchObject({ status: 503, code: 'RATE_LIMIT_UNAVAILABLE' })
  })
})
