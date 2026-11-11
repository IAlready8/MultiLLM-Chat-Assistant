'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const GENERIC_ERROR = 'Unable to prepare your account data. Please retry.'

export function AccountDataDownload() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const download = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const response = await fetch('/api/account/data', { cache: 'no-store' })
      if (!response.ok) {
        const value = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(value?.error ?? GENERIC_ERROR)
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `account-data-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        URL.revokeObjectURL(url)
      }
      setDone(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download your profile, personas, goals, connected providers, plan and
        usage as a JSON file. API keys are never included. Conversations are
        exported separately below as an encrypted archive.
      </p>
      <Button type="button" variant="outline" onClick={download} disabled={busy}>
        {busy ? 'Preparing...' : 'Download account data'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm">
          Account data downloaded.
        </p>
      )}
    </div>
  )
}
