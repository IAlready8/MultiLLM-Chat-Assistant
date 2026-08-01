'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const resolveErrorMessage = (error: string | null | undefined) => {
  switch (error) {
    case 'Configuration':
      return 'Authentication is not configured correctly. Check your auth environment settings.'
    case 'AccessDenied':
      return 'Access was denied. Please try a different sign-in method.'
    case 'Verification':
      return 'Sign-in verification failed. Please try again.'
    case 'CredentialsSignin':
      return 'The provided credentials were invalid.'
    case 'OAuthAccountNotLinked':
      return 'An account with this email uses a different sign-in method. Sign in with the provider originally used for this account.'
    default:
      return 'Authentication failed. Please try signing in again.'
  }
}

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams?.get('error')

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authentication Error</CardTitle>
          <CardDescription>{resolveErrorMessage(error)}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-sm text-muted-foreground">
              Error code: <code>{error}</code>
            </p>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button asChild className="flex-1">
            <Link href="/auth/signin">Back to Sign In</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/">Go Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
