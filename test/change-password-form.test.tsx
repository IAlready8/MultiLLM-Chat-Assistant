import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { ChangePasswordForm } from '@/components/change-password-form'

afterEach(() => vi.unstubAllGlobals())

it('rejects a new password over 72 UTF-8 bytes before calling the API', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<ChangePasswordForm />)
  await user.type(screen.getByLabelText('Current password'), 'old-password-1')
  // 19 key emojis = 19 characters but 76 UTF-8 bytes; bcrypt would truncate.
  const tooLong = '🔐'.repeat(19)
  await user.type(screen.getByLabelText('New password'), tooLong)
  await user.type(screen.getByLabelText('Confirm new password'), tooLong)
  await user.click(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('72 UTF-8 bytes')
  expect(fetch).not.toHaveBeenCalled()
})

it('submits a valid password change and links back to sign-in', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<ChangePasswordForm />)
  await user.type(screen.getByLabelText('Current password'), 'old-password-1')
  await user.type(screen.getByLabelText('New password'), 'new-password-2')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-password-2')
  await user.click(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your password has been changed.')
  expect(screen.getByRole('link', { name: 'Sign in again with your new password.' })).toHaveAttribute(
    'href',
    '/auth/signin'
  )
  expect(fetch).toHaveBeenCalledWith(
    '/api/account/change-password',
    expect.objectContaining({ method: 'POST' })
  )
})
