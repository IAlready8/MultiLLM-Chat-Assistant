import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SignInPage from '@/app/auth/signin/page'

const controls = vi.hoisted(() => ({
  signIn: vi.fn(), session: vi.fn(), search: vi.fn(), navigate: vi.fn(),
  push: vi.fn(), refresh: vi.fn(), toast: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  signIn: controls.signIn, signOut: vi.fn(), useSession: controls.session,
}))
vi.mock('next/navigation', () => ({
  useSearchParams: controls.search,
  useRouter: () => ({ push: controls.push, refresh: controls.refresh }),
}))
vi.mock('@/components/oauth-provider-buttons', () => ({ OAuthProviderButtons: () => null }))
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: controls.toast }) }))
vi.mock('@/lib/auth-redirect', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth-redirect')>(),
  navigateToAuthCallback: controls.navigate,
}))

beforeEach(() => {
  vi.clearAllMocks()
  controls.session.mockReturnValue({ data: null, status: 'unauthenticated' })
  controls.search.mockReturnValue(new URLSearchParams({ callbackUrl: '/settings' }))
  controls.signIn.mockResolvedValue({ ok: true, error: null, url: 'https://other.example/settings' })
})

const submitCredentials = () => {
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'synthetic@example.invalid' } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'synthetic test password' } })
  fireEvent.click(screen.getByRole('button', { name: /^Sign in with password$/ }))
}

describe('credential sign-in navigation', () => {
  it('performs fresh navigation to the validated local callback after a successful exchange', async () => {
    render(<SignInPage />)
    submitCredentials()
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith('/settings'))
    expect(controls.push).not.toHaveBeenCalled()
    expect(controls.signIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ callbackUrl: '/settings', redirect: false }))
  })

  it('does not navigate when credentials are rejected', async () => {
    controls.signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })
    render(<SignInPage />)
    submitCredentials()
    await waitFor(() => expect(controls.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign-in failed' })))
    expect(controls.navigate).not.toHaveBeenCalled()
  })

  it('uses fresh navigation for an already authenticated account', () => {
    controls.session.mockReturnValue({ data: { user: { id: 'synthetic', email: 'synthetic@example.invalid' } }, status: 'authenticated' })
    render(<SignInPage />)
    fireEvent.click(screen.getByRole('button', { name: /^Continue to workspace$/ }))
    expect(controls.navigate).toHaveBeenCalledWith('/settings')
    expect(controls.push).not.toHaveBeenCalled()
  })

  it('retains the safe root fallback for an unsafe callback', async () => {
    controls.search.mockReturnValue(new URLSearchParams({ callbackUrl: '//untrusted.example' }))
    render(<SignInPage />)
    submitCredentials()
    await waitFor(() => expect(controls.navigate).toHaveBeenCalledWith('/'))
  })
})
