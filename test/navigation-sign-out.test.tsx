import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '@testing-library/react'

const mockUseSession = vi.fn()
const mockSignOut = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

import Navbar from '@/components/navbar'

describe('authenticated navigation sign out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'pilot-user',
          name: 'Pilot User',
          email: 'pilot@example.com',
        },
      },
      status: 'authenticated',
    })
  })

  it('exposes the existing NextAuth sign-out flow on desktop and mobile', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    const desktopSignOut = screen.getByRole('button', { name: 'Sign out' })
    await user.click(desktopSignOut)

    expect(mockSignOut).toHaveBeenCalledWith({
      callbackUrl: '/auth/signin',
    })

    await user.click(screen.getByRole('button', { name: 'Toggle menu' }))
    const menu = await screen.findByRole('dialog', { name: 'Menu' })
    await user.click(within(menu).getByRole('button', { name: 'Sign out' }))

    expect(mockSignOut).toHaveBeenCalledTimes(2)
    expect(mockSignOut).toHaveBeenLastCalledWith({
      callbackUrl: '/auth/signin',
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    })
  })

  it('does not expose sign out to unauthenticated users', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    })

    render(<Navbar />)

    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument()
  })
})
