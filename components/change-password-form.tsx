'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const canSubmit =
    !saving && currentPassword.length > 0 && newPassword.length >= 8 && confirmPassword.length > 0

  return (
    <form
      className="space-y-4"
      onSubmit={async event => {
        event.preventDefault()
        if (!canSubmit) return
        setError(null)
        setSaved(false)
        if (newPassword !== confirmPassword) {
          setError('The new passwords do not match.')
          return
        }
        setSaving(true)
        try {
          const response = await fetch('/api/account/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
          })
          const value = (await response.json().catch(() => null)) as { error?: string } | null
          if (!response.ok) {
            throw new Error(value?.error ?? 'Unable to change your password. Please retry.')
          }
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
          setSaved(true)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to change your password. Please retry.')
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="change-password-current">Current password</Label>
        <Input
          id="change-password-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          required
          maxLength={128}
          disabled={saving}
          onChange={event => {
            setCurrentPassword(event.target.value)
            setSaved(false)
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="change-password-new">New password</Label>
        <Input
          id="change-password-new"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          required
          minLength={8}
          maxLength={72}
          disabled={saving}
          aria-describedby="new-password-help"
          onChange={event => {
            setNewPassword(event.target.value)
            setSaved(false)
          }}
        />
        <p id="new-password-help" className="text-sm text-muted-foreground">
          8–72 characters.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="change-password-confirm">Confirm new password</Label>
        <Input
          id="change-password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          required
          maxLength={128}
          disabled={saving}
          onChange={event => {
            setConfirmPassword(event.target.value)
            setSaved(false)
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Your password has been changed. Please sign in again.
        </p>
      )}
      <Button type="submit" disabled={!canSubmit}>
        {saving ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  )
}
