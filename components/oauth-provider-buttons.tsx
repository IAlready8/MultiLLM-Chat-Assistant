'use client'

import { useEffect, useState } from 'react'
import { Github, Loader2, LogIn } from 'lucide-react'
import {
  type ClientSafeProvider,
  getProviders,
  signIn,
} from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

type OAuthProviderButtonsProps = {
  callbackUrl: string
}

const GoogleIcon = () => (
  <svg aria-hidden="true" className="mr-2 h-4 w-4" viewBox="0 0 24 24">
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
)

const ProviderIcon = ({ providerId }: { providerId: string }) => {
  if (providerId === 'google') return <GoogleIcon />
  if (providerId === 'github') {
    return <Github aria-hidden="true" className="mr-2 h-4 w-4" />
  }
  return <LogIn aria-hidden="true" className="mr-2 h-4 w-4" />
}

export function OAuthProviderButtons({
  callbackUrl,
}: OAuthProviderButtonsProps) {
  const [providers, setProviders] = useState<ClientSafeProvider[] | null>(null)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false

    getProviders()
      .then((availableProviders) => {
        if (cancelled) return
        const oauthProviders = Object.values(availableProviders ?? {}).filter(
          (provider) => provider.id !== 'credentials',
        )
        setProviders(oauthProviders)
      })
      .catch((error) => {
        console.error('Failed to load OAuth providers:', error)
        if (!cancelled) setProviders([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSignIn = async (provider: ClientSafeProvider) => {
    setActiveProvider(provider.id)
    try {
      await signIn(provider.id, { callbackUrl })
    } catch (error) {
      console.error(`Failed to start ${provider.name} sign-in:`, error)
      toast({
        title: 'Could not start sign-in',
        description: `Try ${provider.name} again or use another configured method.`,
        variant: 'destructive',
      })
      setActiveProvider(null)
    }
  }

  if (providers === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading secure sign-in options...
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
        Social account creation is not configured yet. An operator must add at
        least one OAuth provider before new accounts can be created.
      </p>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          disabled={activeProvider !== null}
          onClick={() => handleSignIn(provider)}
        >
          {activeProvider === provider.id ? (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ProviderIcon providerId={provider.id} />
          )}
          Continue with {provider.name}
        </Button>
      ))}
    </div>
  )
}
