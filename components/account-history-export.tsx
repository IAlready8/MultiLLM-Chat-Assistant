'use client'

import { useState } from 'react'
import { decrypt, encrypt } from '@/lib/crypto'
import { readBoundedText } from '@/lib/llm-request'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AccountHistoryExport() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [restored, setRestored] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  return <form className="space-y-3" onSubmit={async event => {
    event.preventDefault()
    if (busy || password.length < 12) return
    setBusy(true); setError(null); setComplete(false); setRestored(null)
    try {
      const response = await fetch('/api/account/export', { method: 'POST' })
      if (!response.ok) {
        const value = await response.json().catch(() => ({}))
        throw new Error(value.error || 'Unable to export conversation history.')
      }
      const archive = await readBoundedText(response, 16 * 1024 * 1024)
      const encrypted = await encrypt(archive, password)
      const url = URL.createObjectURL(new Blob([encrypted], { type: 'text/plain' }))
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `multillm-history-${new Date().toISOString().slice(0, 10)}.encrypted`
        document.body.appendChild(link); link.click()
      } finally { link.remove(); URL.revokeObjectURL(url) }
      setPassword(''); setComplete(true)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to export conversation history.') }
    finally { setBusy(false) }
  }}>
    <Label htmlFor="history-password">Conversation archive password</Label>
    <Input id="history-password" type="password" minLength={12} required
      value={password} disabled={busy} autoComplete="new-password"
      onChange={event => setPassword(event.target.value)} />
    <p className="text-sm text-muted-foreground">Download your server conversations and messages in a password-encrypted archive. Keep the password to read the file. Provider keys and billing records are excluded. Restoring creates separate copies and never overwrites existing conversations.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {restored && <p role="status" className="text-sm">{restored}</p>}
    {complete && <p role="status" className="text-sm">Archive prepared. Check your browser downloads.</p>}
    <Button type="submit" disabled={busy || password.length < 12}>{busy ? 'Preparing archive…' : 'Download conversation archive'}</Button>
    <div className="space-y-2 border-t pt-3">
      <Label htmlFor="history-file">Open an existing archive</Label>
      <Input id="history-file" type="file" accept=".encrypted,text/plain" disabled={busy}
        onChange={event => setFile(event.target.files?.[0] ?? null)} />
      <p className="text-sm text-muted-foreground">Use the password above to open this file locally as readable JSON.</p>
      <Button type="button" variant="outline" disabled={busy || !file || !password}
        onClick={async () => {
          if (!file || busy) return
          setBusy(true); setError(null); setComplete(false); setRestored(null)
          try {
            if (file.size > 24 * 1024 * 1024) throw new Error('Archive file exceeds 24 MiB.')
            const content = await decrypt(await file.text(), password)
            const parsed = JSON.parse(content)
            if (parsed.format !== 'multillm-conversation-archive' || parsed.version !== 1 || !Array.isArray(parsed.conversations) || !Array.isArray(parsed.messages)) throw new Error('Unsupported conversation archive.')
            const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
            const link = document.createElement('a')
            try {
              link.href = url; link.download = 'multillm-history.json'
              document.body.appendChild(link); link.click()
            } finally { link.remove(); URL.revokeObjectURL(url) }
          } catch { setError('Unable to open archive. Check its format, size and password.') }
          finally { setBusy(false) }
        }}>Open archive as JSON</Button>
      <p className="text-sm text-muted-foreground">Restore supports archives up to 3 MiB of decrypted JSON, 200 conversations and 2,000 messages. Repeating the same restore skips existing copies. Interrupted responses stay interrupted.</p>
      <Button type="button" disabled={busy || !file || !password} onClick={async () => {
        if (!file || busy) return
        setBusy(true); setError(null); setComplete(false); setRestored(null)
        try {
          if (file.size > 24 * 1024 * 1024) throw new Error('Archive file exceeds 24 MiB.')
          const content = await decrypt(await file.text(), password)
          if (new Blob([content]).size > 3 * 1024 * 1024) throw new Error('Restore supports up to 3 MiB of decrypted JSON.')
          const response = await fetch('/api/account/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: content })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Unable to restore archive.')
          setRestored(`Restored ${result.createdConversations} conversations and ${result.createdMessages} messages. Skipped ${result.skippedConversations} existing copies.`)
          setPassword('')
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to restore archive.') }
        finally { setBusy(false) }
      }}>Restore into my account</Button>
    </div>
  </form>
}
