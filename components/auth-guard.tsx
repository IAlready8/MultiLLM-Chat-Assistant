'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const currentPath = pathname ?? '/'
  const isAuthPage = currentPath.startsWith('/auth')
  const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(currentPath)}`

  useEffect(() => {
    if (status === 'unauthenticated' && !isAuthPage) {
      router.replace(signInUrl)
    }
  }, [isAuthPage, router, signInUrl, status])

  if (isAuthPage || status === 'authenticated') {
    return <>{children}</>
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
