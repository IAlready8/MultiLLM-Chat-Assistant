import { beforeEach, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const auth = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-auth', () => ({ getAuthenticatedUser: auth }))
import { DELETE } from '@/app/api/account/route'
beforeEach(() => vi.resetAllMocks())
it('preserves authentication on the retired email-only deletion endpoint', async () => {
  auth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  expect((await DELETE()).status).toBe(401)
})
it('requires the verified durable flow rather than accepting a stale session and typed email', async () => {
  auth.mockResolvedValue({ user: { id: 'unit-user' } })
  const response = await DELETE()
  expect(response.status).toBe(410)
  expect(await response.json()).toMatchObject({ code: 'DELETION_VERIFICATION_REQUIRED', url: '/account/deletion' })
})
