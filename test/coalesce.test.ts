import { describe, expect, it, vi } from 'vitest'
import { coalesce } from '@/lib/coalesce'

describe('coalesce', () => {
  it('runs once for concurrent callers and gives them all the same result', async () => {
    let resolve: (value: number) => void = () => undefined
    const run = vi.fn(() => new Promise<number>((done) => { resolve = done }))
    const shared = coalesce(run)
    const calls = [shared(), shared(), shared()]
    resolve(7)
    await expect(Promise.all(calls)).resolves.toEqual([7, 7, 7])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs again after settling, so nothing is cached', async () => {
    const run = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')
    const shared = coalesce(run)
    await expect(shared()).resolves.toBe('first')
    await expect(shared()).resolves.toBe('second')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('shares a rejection with concurrent callers and recovers on the next call', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('up')
    const shared = coalesce(run)
    const [a, b] = await Promise.allSettled([shared(), shared()])
    expect(a.status).toBe('rejected')
    expect(b.status).toBe('rejected')
    expect(run).toHaveBeenCalledTimes(1)
    await expect(shared()).resolves.toBe('up')
  })

  it('turns a synchronous throw into a rejection instead of breaking the caller', async () => {
    const shared = coalesce((() => { throw new Error('sync failure') }) as unknown as () => Promise<never>)
    await expect(shared()).rejects.toThrow('sync failure')
    await expect(shared()).rejects.toThrow('sync failure')
  })
})
