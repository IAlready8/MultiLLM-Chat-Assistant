'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AccountProfileForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/account/profile', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load your account profile.')
      const value = await response.json()
      setName(value.name); setEmail(value.email); setLoaded(true); setError(null)
    } catch { setError('Unable to load your account profile.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault()
    if (saving || !loaded) return
    setSaving(true); setError(null); setSaved(false)
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!response.ok) throw new Error('Unable to save your profile. Please retry.')
      const value = await response.json()
      setName(value.name); setEmail(value.email); setSaved(true)
    } catch { setError('Unable to save your profile. Please retry.') }
    finally { setSaving(false) }
  }}>
    <div className="space-y-2">
      <Label htmlFor="account-name">Name</Label>
      <Input id="account-name" value={name} required maxLength={100}
        disabled={loading || saving || !loaded}
        onChange={event => { setName(event.target.value); setSaved(false) }} />
    </div>
    <div className="space-y-2">
      <Label htmlFor="account-email">Sign-in email</Label>
      <Input id="account-email" value={email} readOnly aria-describedby="email-help" />
      <p id="email-help" className="text-sm text-muted-foreground">Your sign-in email is read-only here.</p>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm">Profile saved to your account.</p>}
    {!loaded && !loading ? <Button type="button" onClick={() => void load()}>Retry profile</Button> :
      <Button type="submit" disabled={loading || saving || !name.trim()}>{loading ? 'Loading profile…' : saving ? 'Saving…' : 'Save changes'}</Button>}
  </form>
}
