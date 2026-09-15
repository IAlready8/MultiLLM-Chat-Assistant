import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), export: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ default: { user: { update: mocks.update } } }))
vi.mock('@/services/account-export-service', () => ({ exportAccountHistory: mocks.export }))
vi.mock('@/lib/rate-limit', () => ({ checkAndConsume: mocks.limit }))
vi.mock('@/lib/llm-runtime', () => ({ llmErrorResponse: (error: { status?: number; message: string }) => NextResponse.json({ error: error.message }, { status: error.status ?? 500 }) }))
import { GET, PATCH } from '@/app/api/account/profile/route'
import { POST } from '@/app/api/account/export/route'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'owner', name: 'Name', email: 'owner@example.test', password: 'must-not-return' } })
  mocks.update.mockResolvedValue({ name: 'New name', email: 'owner@example.test' })
  mocks.export.mockResolvedValue('{"format":"multillm-conversation-archive"}')
  mocks.limit.mockResolvedValue({ allowed: true })
})
describe('owned account operations', () => {
  it('returns only safe profile fields and prevents shared caching', async () => {
    const response = await GET()
    expect(await response.json()).toEqual({ name: 'Name', email: 'owner@example.test' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('updates the authenticated account and normalizes its name', async () => {
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: '{"name":" New name "}' }))).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'owner' }, data: { name: 'New name' }, select: { name: true, email: true } })
  })
  it.each([{ name: '', id: 'other' }, { name: 'Name', email: 'admin@example.test' }, { name: 'Name', role: 'OWNER' }, { name: 'a'.repeat(101) }])('rejects invalid fields without changing identity', async body => {
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify(body) }))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('requires a session for profile reads, writes and exports', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({}, { status: 401 }))
    expect((await GET()).status).toBe(401)
    expect((await PATCH(new Request('http://localhost'))).status).toBe(401)
    expect((await POST()).status).toBe(401)
    expect(mocks.export).not.toHaveBeenCalled()
  })
  it('exports only the caller and limits repeated requests', async () => {
    expect((await POST()).status).toBe(200)
    expect(mocks.export).toHaveBeenCalledWith('owner')
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterMs: 1000 })
    expect((await POST()).status).toBe(429)
    expect(mocks.export).toHaveBeenCalledTimes(1)
  })
  it('reports database failures without claiming a saved profile', async () => {
    mocks.update.mockRejectedValue(new Error('private database detail'))
    const response = await PATCH(new Request('http://localhost', { method: 'PATCH', body: '{"name":"Name"}' }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database detail')
  })
})
