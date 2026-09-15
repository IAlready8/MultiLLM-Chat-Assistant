import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'

const mockGetProviders = vi.fn()
const mockSignIn = vi.fn()

vi.mock('next-auth/react', () => ({
  getProviders: () => mockGetProviders(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
}))

import { OAuthProviderButtons } from '@/components/oauth-provider-buttons'

describe('OAuthProviderButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders configured OAuth providers but not credentials', async () => {
    mockGetProviders.mockResolvedValue({
      google: {
        id: 'google',
        name: 'Google',
        type: 'oauth',
        signinUrl: '/api/auth/signin/google',
        callbackUrl: '/api/auth/callback/google',
      },
      credentials: {
        id: 'credentials',
        name: 'Email and password',
        type: 'credentials',
        signinUrl: '/api/auth/signin/credentials',
        callbackUrl: '/api/auth/callback/credentials',
      },
    })

    render(<OAuthProviderButtons callbackUrl="/settings" />)

    const googleButton = await screen.findByRole('button', {
      name: 'Continue with Google',
    })
    expect(
      screen.queryByRole('button', { name: /email and password/i }),
    ).not.toBeInTheDocument()

    await userEvent.click(googleButton)

    expect(mockSignIn).toHaveBeenCalledWith('google', {
      callbackUrl: '/settings',
    })
  })

  it('explains when no account-creation provider is configured', async () => {
    mockGetProviders.mockResolvedValue({
      credentials: {
        id: 'credentials',
        name: 'Email and password',
        type: 'credentials',
        signinUrl: '/api/auth/signin/credentials',
        callbackUrl: '/api/auth/callback/credentials',
      },
    })

    render(<OAuthProviderButtons callbackUrl="/" />)

    await waitFor(() => {
      expect(
        screen.getByText(
          /operator must add a Google OAuth application before new accounts can be created/i,
        ),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/GitHub/i)).not.toBeInTheDocument()
  })

  it.each([null, new Error('offline')])('lets users retry failed provider discovery', async (failure) => {
    if (failure instanceof Error) mockGetProviders.mockRejectedValueOnce(failure)
    else mockGetProviders.mockResolvedValueOnce(failure)
    mockGetProviders.mockResolvedValueOnce({
      google: { id: 'google', name: 'Google', type: 'oauth' },
    })
    render(<OAuthProviderButtons callbackUrl="/" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.queryByText(/operator must add/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry sign-in options' }))
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  })

  it('re-enables the button when starting sign-in fails', async () => {
    mockGetProviders.mockResolvedValue({ google: { id: 'google', name: 'Google', type: 'oauth' } })
    mockSignIn.mockRejectedValueOnce(new Error('offline'))
    render(<OAuthProviderButtons callbackUrl="/" />)
    const button = await screen.findByRole('button', { name: 'Continue with Google' })
    await userEvent.click(button)
    await waitFor(() => expect(button).toBeEnabled())
  })
})
