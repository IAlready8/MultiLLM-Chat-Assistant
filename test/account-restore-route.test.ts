import { beforeEach, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), restore: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.rate }))
vi.mock('@/services/account-restore-service', () => ({ ACCOUNT_RESTORE_MAX_BYTES: 3 * 1024 * 1024, restoreAccountHistory: mocks.restore }))
vi.mock('@/lib/api-read-cache', () => ({ apiReadCacheKey: (_route: string, userId: string) => userId, invalidateApiReadCache: mocks.invalidate }))
import { POST } from '@/app/api/account/restore/route'
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'owner' } }); mocks.rate.mockResolvedValue({ allowed: true })
  mocks.restore.mockResolvedValue({ createdConversations: 1, createdMessages: 2, skippedConversations: 0 })
})
it('requires authentication before reading the archive or accessing storage', async () => {
  mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  expect((await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))).status).toBe(401)
  expect(mocks.restore).not.toHaveBeenCalled(); expect(mocks.rate).not.toHaveBeenCalled()
})
it('uses the session owner and invalidates history after committing', async () => {
  const response = await POST(new Request('http://localhost', { method: 'POST', body: '{"version":1}' }))
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
  expect(mocks.restore).toHaveBeenCalledWith('owner', { version: 1 }); expect(mocks.invalidate).toHaveBeenCalledWith('owner')
})
it('rejects oversized bodies before database access', async () => {
  const response = await POST(new Request('http://localhost', { method: 'POST', headers: { 'content-length': String(3 * 1024 * 1024 + 1) }, body: '{}' }))
  expect(response.status).toBe(413); expect(mocks.restore).not.toHaveBeenCalled()
})
it('denies restore when rate limited', async () => {
  mocks.rate.mockResolvedValue({ allowed: false, retryAfterMs: 1000 })
  expect((await POST(new Request('http://localhost', { method: 'POST', body: '{}' }))).status).toBe(429)
  expect(mocks.restore).not.toHaveBeenCalled()
})
