'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { OAuthProviderButtons } from '@/components/oauth-provider-buttons'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { resolveAuthCallbackUrl } from '@/lib/auth-redirect'

type SignInErrors = {
  email?: string
  password?: string
}

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<SignInErrors>({})
  const { data: session } = useSession()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()

  const callbackUrl = useMemo(
    () => resolveAuthCallbackUrl(searchParams?.get('callbackUrl')),
    [searchParams],
  )
  const registerUrl = `/auth/register?callbackUrl=${encodeURIComponent(callbackUrl)}`

  const validateFields = (): SignInErrors => {
    const errors: SignInErrors = {}
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      errors.email = 'Email is required.'
    } else if (!normalizedEmail.includes('@') || normalizedEmail.length > 254) {
      errors.email = 'Enter a valid email address.'
    }

    if (!password) {
      errors.password = 'Password is required.'
    } else if (password.length > 128) {
      errors.password = 'Password is too long.'
    }

    return errors
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const errors = validateFields()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        callbackUrl,
        redirect: false,
      })

      if (!result?.ok || result.error) {
        toast({
          title: 'Sign-in failed',
          description: 'The email or password was incorrect.',
          variant: 'destructive',
        })
        return
      }

      router.push(result.url ?? callbackUrl)
      router.refresh()
    } catch (error) {
      console.error('Credential sign-in failed:', error)
      toast({
        title: 'Sign-in unavailable',
        description: 'Authentication could not be completed. Try again shortly.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2">
              <CardTitle>Already signed in</CardTitle>
              <Badge variant="secondary">Secure</Badge>
            </div>
            <CardDescription>
              You are signed in as {session.user?.email || session.user?.name}.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" onClick={() => router.push(callbackUrl)}>
              Continue to workspace
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            >
              Sign out
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
            <CardTitle>Sign in</CardTitle>
            <Badge variant="secondary">Secure</Badge>
          </div>
          <CardDescription>
            Access your saved providers, comparisons, and workspace history.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <OAuthProviderButtons callbackUrl={callbackUrl} />

          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Existing password account
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (fieldErrors.email) {
                      setFieldErrors((current) => ({
                        ...current,
                        email: undefined,
                      }))
                    }
                  }}
                  className="pl-10"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" className="text-xs text-destructive">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (fieldErrors.password) {
                      setFieldErrors((current) => ({
                        ...current,
                        password: undefined,
                      }))
                    }
                  }}
                  className="pl-10"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? 'password-error' : undefined
                  }
                />
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-xs text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in with password'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center text-sm text-muted-foreground">
          New to the workspace?{' '}
          <Link className="ml-1 text-primary hover:underline" href={registerUrl}>
            Create an account
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
