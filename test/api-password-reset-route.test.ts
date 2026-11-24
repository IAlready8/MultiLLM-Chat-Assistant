// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const limiter = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: limiter }))

const consume = vi.hoisted(() => vi.fn())
vi.mock('@/lib/password-reset', async () => {
  const actual = await vi.importActual<typeof import('@/lib/password-reset')>('@/lib/password-reset')
  return { ...actual, consumePasswordResetToken: consume }
})
vi.mock('@/lib/prisma', () => ({ default: {} }))

import { POST } from '@/app/api/auth/password-reset/route'
import { INVALID_RESET_MESSAGE, PasswordResetError } from '@/lib/password-reset'

const request = (body: unknown, ip = '203.0.113.7') => new Request('https://app.example/api/auth/password-reset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
  body: JSON.stringify(body),
})

beforeEach(() => {
  limiter.mockReset().mockResolvedValue({ allowed: true })
  consume.mockReset().mockResolvedValue(undefined)
})

describe('POST /api/auth/password-reset', () => {
  it('resets with a valid token and is never cached', async () => {
    const response = await POST(request({ token: 'A'.repeat(43), password: 'a fresh password 1' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(consume).toHaveBeenCalledWith('A'.repeat(43), 'a fresh password 1')
  })

  it('limits attempts per client address and overall before reading the token', async () => {
    await POST(request({ token: 'A'.repeat(43), password: 'a fresh password 1' }))
    expect(limiter).toHaveBeenCalledWith('auth:password-reset:ip:203.0.113.7', { max: 10, windowMs: 900000 })
    expect(limiter).toHaveBeenCalledWith('auth:password-reset:global', { max: 200, windowMs: 900000 })
    limiter.mockResolvedValueOnce({ allowed: false })
    const limited = await POST(request({ token: 'A'.repeat(43), password: 'a fresh password 1' }))
    expect(limited.status).toBe(429)
    expect(consume).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the shared limiter is unavailable', async () => {
    limiter.mockRejectedValueOnce(new Error('limiter down'))
    const response = await POST(request({ token: 'A'.repeat(43), password: 'a fresh password 1' }))
    expect(response.status).toBe(503)
    expect(consume).not.toHaveBeenCalled()
  })

  it('returns one uniform message for every invalid, expired or used token', async () => {
    consume.mockRejectedValue(new PasswordResetError('invalid', 'internal detail that must not leak'))
    const response = await POST(request({ token: 'A'.repeat(43), password: 'a fresh password 1' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: INVALID_RESET_MESSAGE })
  })

  it('explains password requirements without revealing token state', async () => {
    consume.mockRejectedValue(new PasswordResetError('weak-password', 'Use at least 8 characters and at most 72 UTF-8 bytes.'))
    const response = await POST(request({ token: 'A'.repeat(43), password: 'short' }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/at least 8 characters/)
  })

  it('returns a retryable error without internals when the store fails', async () => {
    consume.mockRejectedValue(new Error('connection string with secrets'))
    const response = await POST(request({ token: 'A'.repeat(43), password: 'a fresh password 1' }))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('secrets')
  })

  it('rejects a non-object body', async () => {
    const response = await POST(new Request('https://app.example/api/auth/password-reset', { method: 'POST', body: '[]', headers: { 'Content-Type': 'application/json' } }))
    expect(response.status).toBe(400)
    expect(consume).not.toHaveBeenCalled()
  })
})
