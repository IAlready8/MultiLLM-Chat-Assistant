'use client'

import { isPublicPagePath } from '@/lib/public-routes'
import { Fragment, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const currentPath = pathname ?? '/'
  const isAuthPage = currentPath.startsWith('/auth/') || isPublicPagePath(currentPath)
  const hasIdentity = status === 'authenticated' && Boolean(session?.user?.id)
  const deletionPending = Boolean(session?.user?.deletionPending)
  const isDeletionPage = currentPath === '/account/deletion'
  const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(currentPath)}`

  useEffect(() => {
    if (hasIdentity && deletionPending && !isDeletionPage && !isAuthPage) {
      router.replace('/account/deletion')
    } else if (status !== 'loading' && !hasIdentity && !isAuthPage) {
      router.replace(signInUrl)
    }
  }, [isAuthPage, router, signInUrl, status, hasIdentity, deletionPending, isDeletionPage])

  if (isAuthPage || (hasIdentity && (!deletionPending || isDeletionPage))) {
    return <Fragment key={session?.user?.id ?? 'public'}>{children}</Fragment>
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center space-y-6 p-8 text-center">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Sign-in required</h2>
          <p className="text-muted-foreground">
            Continue to sign in to access your workspace.
          </p>
        </div>
        <Button onClick={() => router.replace(signInUrl)}>
          Continue to sign in
        </Button>
      </div>
    </div>
  )
}
