'use client'

import { LogOut } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

type SignOutButtonProps = {
  className?: string
  onBeforeSignOut?: () => void
}

export function SignOutButton({
  className,
  onBeforeSignOut,
}: SignOutButtonProps) {
  const { status } = useSession()

  if (status !== 'authenticated') {
    return null
  }

  const handleSignOut = () => {
    onBeforeSignOut?.()
    void signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handleSignOut}
    >
      <LogOut aria-hidden="true" className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  )
}
