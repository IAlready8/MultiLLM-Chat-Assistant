'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { OAuthProviderButtons } from '@/components/oauth-provider-buttons'
import { resolveAuthCallbackUrl } from '@/lib/auth-redirect'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function RegisterPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = useMemo(
    () => resolveAuthCallbackUrl(searchParams?.get('callbackUrl')),
    [searchParams],
  )
  const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`

  if (session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Account ready</CardTitle>
            <CardDescription>
              You are signed in as {session.user?.email || session.user?.name}.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => router.push(callbackUrl)}>
              Continue to workspace
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2">
            <CardTitle>Create account</CardTitle>
            <Badge variant="secondary">Verified provider</Badge>
          </div>
          <CardDescription>
            Use a configured OAuth provider to create a durable workspace
            account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <OAuthProviderButtons callbackUrl={callbackUrl} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Password registration is unavailable until verified email and account
            recovery are configured. Existing password accounts can still sign in.
          </p>
        </CardContent>

        <CardFooter className="justify-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link className="ml-1 text-primary hover:underline" href={signInUrl}>
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
