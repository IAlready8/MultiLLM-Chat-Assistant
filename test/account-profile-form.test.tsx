import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { AccountProfileForm } from '@/components/account-profile-form'
afterEach(() => vi.unstubAllGlobals())
it('loads server identity, keeps email read-only and persists the edited name', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ name: 'Old', email: 'owner@example.test' })).mockResolvedValueOnce(Response.json({ name: 'New', email: 'owner@example.test' }))
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<AccountProfileForm />)
  const name = await screen.findByDisplayValue('Old')
  expect(screen.getByLabelText('Sign-in email')).toHaveAttribute('readonly')
  await user.clear(name); await user.type(name, 'New')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('status')).toHaveTextContent('saved to your account')
  expect(fetch.mock.calls[1][1].body).toBe('{"name":"New"}')
})
it('retains the edited name when saving fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ name: 'Old', email: '' })).mockResolvedValueOnce(new Response('', { status: 503 })))
  const user = userEvent.setup()
  render(<AccountProfileForm />)
  const name = await screen.findByDisplayValue('Old')
  await user.clear(name); await user.type(name, 'Keep this')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Please retry')
  expect(name).toHaveValue('Keep this')
})
