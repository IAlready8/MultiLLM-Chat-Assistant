'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clearStoredApiKeys } from '@/lib/secure-storage'

type DeletionState = {
  userId: string
  email?: string | null
  hasPassword: boolean
  providers: string[]
  recentOAuth: boolean
  progress: { status: string; error: string | null } | null
}
const TARGET_KEY = 'multillm.deletionTarget'

export function AccountDeletionPanel() {
  const [state, setState] = useState<DeletionState | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accountChanged, setAccountChanged] = useState(false)
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/account/deletion', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load account deletion. Refresh or sign in again.')
      const value: DeletionState = await response.json()
      setState(value)
      const target = sessionStorage.getItem(TARGET_KEY)
      setAccountChanged(Boolean(target && target !== value.userId))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Account deletion unavailable.') }
  }, [])
  useEffect(() => { void load() }, [load])

  const pending = Boolean(state?.progress && state.progress.status !== 'complete')
  return <Card>
    <CardHeader><CardTitle>Delete account</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p>This permanently removes active conversations, personas and saved provider keys. Account deletion ends any subscription immediately, stops future renewal and does not automatically issue a refund. Download your data before confirming. Backup copies expire under the published retention policy.</p>
      <Link className="underline" href="/settings">Data export is available in Settings → Advanced.</Link>
      {state && <p>Account: <strong className="break-all">{state.email || state.userId}</strong></p>}
      {error && <p role="alert">{error}</p>}
      {pending && <p role="status">Your deletion request is saved. New workspace activity is blocked. Retry to finish; billing or database failures keep the request available for recovery.</p>}
      {accountChanged && <p role="alert">The signed-in account changed during verification. No deletion was submitted. Sign in to the original account, or explicitly start over for the account shown here.</p>}
      {accountChanged && <Button type="button" variant="outline" onClick={() => { sessionStorage.removeItem(TARGET_KEY); setAccountChanged(false); setConfirmation(''); setPassword('') }}>Start over for this account</Button>}
      {state && !pending && !state.recentOAuth && state.providers.map(provider => <Button key={provider} type="button" variant="outline" disabled={busy || accountChanged} onClick={() => {
        sessionStorage.setItem(TARGET_KEY, state.userId)
        void signIn(provider, { callbackUrl: '/account/deletion' }, { prompt: 'select_account', max_age: '0' })
      }}>Verify again with {provider === 'google' ? 'Google' : 'GitHub'}</Button>)}
      {state?.recentOAuth && !pending && <p role="status">Recent sign-in verified. Review the account and confirm below.</p>}
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault()
        if (!state || busy || accountChanged) return
        setBusy(true); setError('')
        try {
          const response = await fetch('/api/account/deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: state.userId, confirmation: pending ? 'DELETE MY ACCOUNT' : confirmation, ...(password ? { password } : {}) }) })
          const value = await response.json()
          if (!response.ok) { await load(); throw new Error(value.error || 'Deletion is incomplete. Retry shortly.') }
          if (value.status !== 'complete') { await load(); setError('Deletion is already running. Retry shortly.'); return }
          clearStoredApiKeys()
          for (const key of ['settings.profile', 'modelSettings', 'userPreferences']) localStorage.removeItem(key)
          sessionStorage.removeItem(TARGET_KEY)
          setPassword('')
          await signOut({ callbackUrl: '/auth/signin?deleted=true' })
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Deletion is incomplete. Retry shortly.') }
        finally { setBusy(false) }
      }}>
        {!pending && <>
          {state?.hasPassword && !state.recentOAuth && <><Label htmlFor="deletion-password">Current password</Label><Input id="deletion-password" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></>}
          <Label htmlFor="deletion-confirmation">Type DELETE MY ACCOUNT to confirm</Label>
          <Input id="deletion-confirmation" value={confirmation} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
        </>}
        <Button type="submit" variant="destructive" disabled={!state || busy || accountChanged || (!pending && (confirmation !== 'DELETE MY ACCOUNT' || (!state.recentOAuth && !password)))}>{busy ? 'Processing deletion…' : pending ? 'Retry account deletion' : 'Permanently delete account'}</Button>
      </form>
    </CardContent>
  </Card>
}
