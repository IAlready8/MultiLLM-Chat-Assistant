import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  status: 'unauthenticated' as 'unauthenticated' | 'authenticated' | 'loading',
  pathname: '/',
  replace: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: mocks.status, data: null }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}))

import { AuthGuard } from '@/components/auth-guard'

const renderAt = (pathname: string) => {
  mocks.pathname = pathname
  return render(
    <AuthGuard>
      <p>page content</p>
    </AuthGuard>,
  )
}

beforeEach(() => {
  mocks.status = 'unauthenticated'
  mocks.replace.mockReset()
})

describe('AuthGuard', () => {
  it.each(['/terms', '/privacy', '/pricing', '/support', '/auth/signin', '/auth/register'])(
    'renders %s for a signed-out visitor without redirecting',
    (pathname) => {
      renderAt(pathname)
      expect(screen.getByText('page content')).toBeInTheDocument()
      expect(mocks.replace).not.toHaveBeenCalled()
    },
  )

  it.each(['/', '/settings', '/billing', '/termsandmore', '/privacy-export'])(
    'hides %s from a signed-out visitor and sends them to sign in',
    (pathname) => {
      renderAt(pathname)
      expect(screen.queryByText('page content')).not.toBeInTheDocument()
      expect(mocks.replace).toHaveBeenCalledWith(
        `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`,
      )
    },
  )

  it('does not render protected content while the session is still loading', () => {
    mocks.status = 'loading'
    renderAt('/settings')
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
    expect(screen.getByText('Checking session...')).toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('renders protected content for a signed-in user', () => {
    mocks.status = 'authenticated'
    renderAt('/settings')
    expect(screen.getByText('page content')).toBeInTheDocument()
  })
})
