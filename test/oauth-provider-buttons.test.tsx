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
          /operator must add a Google or GitHub OAuth application before new accounts can be created/i,
        ),
      ).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /continue with github/i }),
    ).not.toBeInTheDocument()
  })
})
