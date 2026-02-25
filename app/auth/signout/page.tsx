'use client'

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignOutPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams?.get('callbackUrl') || '/'

  useEffect(() => {
    signOut({ callbackUrl }).catch((error) => {
      console.error('Sign out failed:', error)
    })
  }, [callbackUrl])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Signing Out</CardTitle>
          <CardDescription>Your session is being ended.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Please wait...</p>
        </CardContent>
      </Card>
    </div>
  )
}
