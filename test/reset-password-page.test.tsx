import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ResetPasswordPage from '@/app/auth/reset-password/page'

const TOKEN = 'B'.repeat(43)
const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const fill = (password: string, confirmation = password) => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } })
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }))
}

describe('reset password page', () => {
  it('shows the uniform invalid-link message when no token is present', async () => {
    window.history.replaceState(null, '', '/auth/reset-password')
    render(<ResetPasswordPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/)
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('reads the token from the fragment, strips it from the address bar and submits it', async () => {
    window.history.replaceState(null, '', `/auth/reset-password#token=${TOKEN}`)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    render(<ResetPasswordPage />)
    await screen.findByLabelText('New password')
    expect(window.location.hash).toBe('')
    fill('a fresh password 1')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/every existing session was signed out/))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/password-reset', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ token: TOKEN, password: 'a fresh password 1' }),
    }))
  })

  it('validates locally before sending anything', async () => {
    window.history.replaceState(null, '', `/auth/reset-password#token=${TOKEN}`)
    render(<ResetPasswordPage />)
    await screen.findByLabelText('New password')
    fill('short')
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/)
    fill('a fresh password 1', 'a different password')
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server message when the link was already used', async () => {
    window.history.replaceState(null, '', `/auth/reset-password#token=${TOKEN}`)
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'This reset link is invalid or has expired. Contact support for a new link.' }) })
    render(<ResetPasswordPage />)
    await screen.findByLabelText('New password')
    fill('a fresh password 1')
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/)
  })
})
