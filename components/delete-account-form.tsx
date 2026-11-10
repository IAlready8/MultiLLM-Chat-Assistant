'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const GENERIC_ERROR = 'Unable to delete your account. Nothing was removed. Please retry.'

type DeleteResponse = { ok?: boolean; error?: string; code?: string } | null

export function DeleteAccountForm() {
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    !deleting &&
    !deleted &&
    acknowledged &&
    confirmEmail.trim().length > 0 &&
    (!needsPassword || password.length > 0)

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!canSubmit) return
        setError(null)
        setDeleting(true)
        try {
          const response = await fetch('/api/account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              confirmEmail: confirmEmail.trim(),
              ...(needsPassword && password ? { password } : {}),
            }),
          })
          const value = (await response.json().catch(() => null)) as DeleteResponse
          if (!response.ok) {
            if (value?.code === 'PASSWORD_REQUIRED') setNeedsPassword(true)
            throw new Error(value?.error ?? GENERIC_ERROR)
          }
          setDeleted(true)
          // The server has already revoked this account; clear the local
          // session cookie and leave the workspace.
          void signOut({ callbackUrl: '/auth/signin' })
        } catch (err) {
          setError(err instanceof Error ? err.message : GENERIC_ERROR)
        } finally {
          setDeleting(false)
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        This permanently deletes your account, conversations, personas, goals,
        saved provider API keys and usage history, and cancels any active
        subscription immediately without a refund for the unused period. It
        cannot be undone. Export a conversation archive first if you want a
        copy.
      </p>
      <div className="space-y-2">
        <Label htmlFor="delete-account-email">Type your account email to confirm</Label>
        <Input
          id="delete-account-email"
          type="email"
          autoComplete="off"
          value={confirmEmail}
          required
          maxLength={254}
          disabled={deleting || deleted}
          onChange={(event) => setConfirmEmail(event.target.value)}
        />
      </div>
      {needsPassword && (
        <div className="space-y-2">
          <Label htmlFor="delete-account-password">Current password</Label>
          <Input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            required
            maxLength={128}
            disabled={deleting || deleted}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      )}
      <div className="flex items-start gap-2">
        <input
          id="delete-account-acknowledge"
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={acknowledged}
          disabled={deleting || deleted}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <Label htmlFor="delete-account-acknowledge" className="font-normal leading-snug">
          I understand this is permanent and cannot be undone.
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {deleted && (
        <p role="status" className="text-sm">
          Your account has been deleted. Signing you out.
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={!canSubmit}>
        {deleting ? 'Deleting account...' : 'Delete my account'}
      </Button>
    </form>
  )
}
