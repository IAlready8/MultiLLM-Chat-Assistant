import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'

const signOut = vi.hoisted(() => vi.fn())
vi.mock('next-auth/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-auth/react')>()),
  signOut,
}))

import { DeleteAccountForm } from '@/components/delete-account-form'

beforeEach(() => signOut.mockReset())
afterEach(() => vi.unstubAllGlobals())

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Type your account email to confirm'), 'owner@example.test')
  await user.click(screen.getByLabelText('I understand this is permanent and cannot be undone.'))
}

it('stays disabled until the email is typed and the warning is acknowledged', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<DeleteAccountForm />)
  const button = screen.getByRole('button', { name: 'Delete my account' })
  expect(button).toBeDisabled()
  await user.type(screen.getByLabelText('Type your account email to confirm'), 'owner@example.test')
  expect(button).toBeDisabled()
  await user.click(screen.getByLabelText('I understand this is permanent and cannot be undone.'))
  expect(button).toBeEnabled()
  expect(fetch).not.toHaveBeenCalled()
})

it('deletes the account and signs out', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<DeleteAccountForm />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Delete my account' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your account has been deleted.')
  expect(fetch).toHaveBeenCalledWith(
    '/api/account',
    expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ confirmEmail: 'owner@example.test' }) }),
  )
  expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/auth/signin' })
})

it('reveals the password field when the server requires it and then sends it', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: 'Enter your current password to delete this account.', code: 'PASSWORD_REQUIRED' }, { status: 400 }),
    )
    .mockResolvedValueOnce(Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<DeleteAccountForm />)
  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Delete my account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter your current password')
  expect(signOut).not.toHaveBeenCalled()
  await user.type(screen.getByLabelText('Current password'), 'secret-pass')
  await user.click(screen.getByRole('button', { name: 'Delete my account' }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ confirmEmail: 'owner@example.test', password: 'secret-pass' })
})

it('shows the server error and keeps the session when deletion fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Your subscription could not be cancelled.' }, { status: 503 })))
  const user = userEvent.setup()
  render(<DeleteAccountForm />)
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Delete my account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your subscription could not be cancelled.')
  expect(signOut).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
