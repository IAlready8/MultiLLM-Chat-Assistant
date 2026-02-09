'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { ClientSafeProvider, getProviders, signIn, signOut, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Github, Loader2, Lock, Mail, User } from 'lucide-react'

type SignInErrors = {
  name?: string
  email?: string
  password?: string
}

type GuestMigrationCounts = {
  goals: number
  providerConfigs: number
  conversations: number
  personas: number
}

type MigrationState = 'idle' | 'running' | 'failed' | 'succeeded'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<SignInErrors>({})
  const [migrationState, setMigrationState] = useState<MigrationState>('idle')
  const [migrationError, setMigrationError] = useState<string | null>(null)
  const [migrationCounts, setMigrationCounts] = useState<GuestMigrationCounts | null>(null)
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const [oauthProviders, setOauthProviders] = useState<ClientSafeProvider[]>([])
  const strictAuthEnabled = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN === 'true'
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED !== 'false'
  const demoBypassEnabled =
    !strictAuthEnabled &&
    (process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH === 'true' ||
      (process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BYPASS_AUTH === undefined &&
        process.env.NODE_ENV !== 'production'))
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL || 'demo@local.dev'
  const demoPassword =
    process.env.NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD || 'demo12345'
  const guestUserId = process.env.NEXT_PUBLIC_GUEST_USER_ID || 'guest-local-user'
  const shouldAttemptGuestMigration = !strictAuthEnabled

  const callbackUrl = useMemo(() => {
    const callback = searchParams.get('callbackUrl')
    return callback && callback.startsWith('/') ? callback : '/'
  }, [searchParams])

  const postAuthUpgrade = useMemo(
    () => searchParams.get('postAuth') === '1',
    [searchParams]
  )

  useEffect(() => {
    const loadProviders = async () => {
      const providers = await getProviders()
      if (!providers) {
        setOauthProviders([])
        return
      }

      const oauth = Object.values(providers).filter(
        (provider) => provider.id !== 'credentials'
      )
      setOauthProviders(oauth)
    }

    loadProviders().catch((error) => {
      console.error('Failed to load auth providers:', error)
      setOauthProviders([])
    })
  }, [])

  const runGuestMigration = useCallback(async () => {
    if (!shouldAttemptGuestMigration) {
      return true
    }

    setMigrationState('running')
    setMigrationError(null)

    let lastError = 'Failed to migrate guest data.'

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch('/api/auth/upgrade-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestUserId }),
        })

        if (response.status === 401 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200))
          continue
        }

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          lastError =
            typeof payload?.error === 'string'
              ? payload.error
              : 'Failed to migrate guest data.'
          throw new Error(lastError)
        }

        const counts: GuestMigrationCounts = {
          goals: Number(payload?.counts?.goals ?? 0),
          providerConfigs: Number(payload?.counts?.providerConfigs ?? 0),
          conversations: Number(payload?.counts?.conversations ?? 0),
          personas: Number(payload?.counts?.personas ?? 0),
        }

        const total =
          counts.goals +
          counts.providerConfigs +
          counts.conversations +
          counts.personas

        setMigrationCounts(counts)
        setMigrationState('succeeded')

        if (total > 0) {
          toast({
            title: 'Guest data migrated',
            description: `Moved ${total} item(s) to your account.`,
          })
        }

        return true
      } catch (error) {
        if (error instanceof Error && error.message.trim()) {
          lastError = error.message
        }
      }
    }

    setMigrationState('failed')
    setMigrationError(lastError)
    toast({
      title: 'Guest data migration failed',
      description: `${lastError} You can retry now.`,
      variant: 'destructive',
    })
    return false
  }, [guestUserId, shouldAttemptGuestMigration, toast])

  useEffect(() => {
    if (!session?.user?.id || !postAuthUpgrade) {
      return
    }

    if (migrationState === 'running' || migrationState === 'succeeded') {
      return
    }

    let isCancelled = false
    runGuestMigration().then((ok) => {
      if (ok && !isCancelled) {
        router.replace(callbackUrl)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [
    session?.user?.id,
    postAuthUpgrade,
    migrationState,
    callbackUrl,
    router,
    runGuestMigration,
  ])

  const resolveSignInError = (error: string) => {
    switch (error) {
      case 'CredentialsSignin':
        return isSignUp
          ? 'Sign-up failed. Try a different email or check your password.'
          : 'Invalid email or password.'
      case 'OAuthAccountNotLinked':
        return 'This email is already linked to another sign-in method.'
      case 'AccessDenied':
        return 'Sign-in was denied. Please check your account access.'
      default:
        return error
    }
  }

  const clearFieldError = (field: keyof SignInErrors, value: string) => {
    if (!fieldErrors[field]) {
      return
    }

    if (!value.trim()) {
      return
    }

    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const applyDemoCredentials = () => {
    setFieldErrors({})
    setIsSignUp(false)
    setName('')
    setEmail(demoEmail)
    setPassword(demoPassword)
    toast({
      title: 'Demo credentials loaded',
      description: 'Submit to sign in with the demo account.',
    })
  }

  const validateFields = () => {
    const nextErrors: SignInErrors = {}

    if (isSignUp && !name.trim()) {
      nextErrors.name = 'Full name is required.'
    }

    if (!email.trim()) {
      nextErrors.email = 'Email is required.'
    } else if (!email.includes('@') || !email.includes('.')) {
      nextErrors.email = 'Please enter a valid email address.'
    }

    if (!password.trim()) {
      nextErrors.password = 'Password is required.'
    } else if (isSignUp && password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.'
    }

    return nextErrors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors = validateFields()

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        name: isSignUp ? name : undefined,
        callbackUrl,
        redirect: false,
      })

      if (result?.error) {
        toast({
          title: 'Error',
          description: resolveSignInError(result.error),
          variant: 'destructive'
        })
      } else {
        let migrationOk = true
        if (shouldAttemptGuestMigration) {
          migrationOk = await runGuestMigration()
        }

        if (migrationOk) {
          toast({
            title: 'Success',
            description: isSignUp
              ? 'Account created successfully!'
              : 'Signed in successfully!',
          })
        } else {
          toast({
            title: 'Signed in',
            description:
              'Authentication succeeded, but guest data migration needs attention.',
            variant: 'destructive',
          })
        }

        if (migrationOk) {
          router.push(result?.url ?? callbackUrl)
        }
      }
    } catch (error) {
      console.error('Sign in error:', error)
      toast({
        title: 'Error',
        description: 'An error occurred during authentication',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSocialSignIn = async (providerId: string, providerName: string) => {
    setLoading(true)
    try {
      const socialCallbackUrl = shouldAttemptGuestMigration
        ? `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}&postAuth=1`
        : callbackUrl

      const result = await signIn(providerId, { callbackUrl: socialCallbackUrl })
      if (result?.error) {
        toast({
          title: 'Error',
          description: resolveSignInError(result.error),
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error(`Sign in with ${providerName} error:`, error)
      toast({
        title: 'Error',
        description: `An error occurred during ${providerName} authentication`,
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    const totalMigrated =
      (migrationCounts?.goals ?? 0) +
      (migrationCounts?.providerConfigs ?? 0) +
      (migrationCounts?.conversations ?? 0) +
      (migrationCounts?.personas ?? 0)

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2">
              <CardTitle>Already Signed In</CardTitle>
              <Badge variant="secondary">Secure</Badge>
            </div>
            <CardDescription>
              You are already signed in as {session.user?.email}
            </CardDescription>
            {migrationState === 'running' && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-2 pt-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Migrating guest data...
              </p>
            )}
            {migrationState === 'failed' && (
              <p className="text-xs text-destructive pt-2">
                {migrationError || 'Guest data migration failed.'}
              </p>
            )}
            {migrationState === 'succeeded' && totalMigrated > 0 && (
              <p className="text-xs text-emerald-600 pt-2">
                Migrated {totalMigrated} item(s) from guest mode.
              </p>
            )}
          </CardHeader>
          <CardFooter className="flex flex-col space-y-2">
            <Button
              className="w-full" 
              onClick={() => router.push(callbackUrl)}
              disabled={migrationState === 'running'}
            >
              Go to Dashboard
            </Button>
            {migrationState === 'failed' && (
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const ok = await runGuestMigration()
                  if (ok) {
                    router.push(callbackUrl)
                  }
                }}
              >
                Retry Data Migration
              </Button>
            )}
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => signOut({ callbackUrl })}
            >
              Sign Out
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2">
            <CardTitle>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </CardTitle>
            <Badge variant="secondary">Secure</Badge>
          </div>
          <CardDescription>
            {isSignUp 
              ? 'Enter your details to create an account' 
              : 'Enter your credentials to access your account'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            {!strictAuthEnabled && demoEnabled && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
                <p className="font-medium">Demo access is enabled</p>
                <p className="text-muted-foreground">
                  Use the demo account to continue testing without creating a new account.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyDemoCredentials}
                    disabled={loading}
                  >
                    Use demo credentials
                  </Button>
                  {demoBypassEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(callbackUrl)}
                      disabled={loading}
                    >
                      Continue as demo guest
                    </Button>
                  )}
                </div>
              </div>
            )}

            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => {
                      const value = e.target.value
                      setName(value)
                      clearFieldError('name', value)
                    }}
                    required={isSignUp}
                    className="pl-10"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                  />
                </div>
                {fieldErrors.name && (
                  <p id="name-error" className="text-xs text-destructive">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    const value = e.target.value
                    setEmail(value)
                    clearFieldError('email', value)
                  }}
                  required
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
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    const value = e.target.value
                    setPassword(value)
                    clearFieldError('password', value)
                  }}
                  required
                  className="pl-10"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-xs text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              className="w-full" 
              type="submit" 
              disabled={loading}
            >
              {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
            
            {oauthProviders.length > 0 && (
              <>
                <div className="flex items-center justify-center my-4">
                  <div className="border-t border-gray-300 flex-grow"></div>
                  <span className="px-4 text-sm text-muted-foreground">OR</span>
                  <div className="border-t border-gray-300 flex-grow"></div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 w-full">
                  {oauthProviders.map((provider) => (
                    <Button
                      key={provider.id}
                      variant="outline"
                      type="button"
                      onClick={() => handleSocialSignIn(provider.id, provider.name)}
                      disabled={loading}
                    >
                      {provider.id === 'google' ? (
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                          <path
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            fill="#34A853"
                          />
                          <path
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            fill="#EA4335"
                          />
                        </svg>
                      ) : (
                        <Github className="w-4 h-4 mr-2" />
                      )}
                      {provider.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
            
            <div className="text-center text-sm mt-2">
              {isSignUp ? (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(false)
                      setFieldErrors({})
                    }}
                    className="text-primary hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <p>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true)
                      setFieldErrors({})
                    }}
                    className="text-primary hover:underline"
                  >
                    Sign up
                  </button>
                </p>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
