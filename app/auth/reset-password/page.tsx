'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INVALID = 'This reset link is invalid or has expired. Contact support for a new link.'

// The token travels in the URL fragment, which browsers never send to the
// server or in Referer headers. It is removed from the address bar on load.
const readTokenFromFragment = () => {
  if (typeof window === 'undefined') return null
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => { setToken(readTokenFromFragment()) }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) return
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setError('Use at least 8 characters and at most 72 UTF-8 bytes.')
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        cache: 'no-store',
      })
      if (response.ok) {
        setDone(true)
        setToken(null)
        setPassword('')
        setConfirmation('')
        return
      }
      const body = await response.json().catch(() => ({}))
      setError(typeof body?.error === 'string' ? body.error : INVALID)
    } catch {
      setError('Unable to reach the server. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>For existing password accounts. Links are issued by support, expire after 60 minutes and work once.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done && <p role="status">Your password was changed and every existing session was signed out. Sign in with your new password.</p>}
          {!done && token === null && <p role="alert">{INVALID}</p>}
          {!done && token && (
            <form className="space-y-4" onSubmit={submit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Set new password'}</Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-sm">
          <Link className="text-primary hover:underline" href="/auth/signin">Back to sign in</Link>
        </CardFooter>
      </Card>
    </div>
  )
}
