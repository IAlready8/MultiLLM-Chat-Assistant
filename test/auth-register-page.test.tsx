import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('callbackUrl=%2Fsettings'),
}))
vi.mock('@/components/oauth-provider-buttons', () => ({
  OAuthProviderButtons: ({ callbackUrl }: { callbackUrl: string }) => (
    <button data-callback-url={callbackUrl}>Continue with configured provider</button>
  ),
}))

import RegisterPage from '@/app/auth/register/page'

describe('registration guidance', () => {
  it('uses provider-neutral copy without changing password registration or callback behavior', () => {
    render(<RegisterPage />)
    expect(screen.getByText('Use an available sign-in provider to create your workspace account.')).toBeVisible()
    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Password registration is unavailable until verified email and account recovery are configured/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Continue with configured provider' })).toHaveAttribute('data-callback-url', '/settings')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin?callbackUrl=%2Fsettings')
  })
})
