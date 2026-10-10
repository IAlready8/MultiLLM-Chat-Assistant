'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Scale } from 'lucide-react'

type JevConfig = {
  configured: boolean
  enabled: boolean
  hasKey: boolean
}

export function JevSettingsForm() {
  const [config, setConfig] = useState<JevConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/jev/config')
      if (res.ok) {
        const data = await res.json()
        setConfig(data)
        setEnabled(data.enabled)
      }
    } catch {
      // Ignore load errors
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleSave = async () => {
    if (!apiKey.trim() && !config?.hasKey) {
      toast({
        title: 'API key required',
        description: 'Enter your TypeSafe API key to enable Jev judging.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/jev/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          enabled,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const data = await res.json()
      setConfig(data)
      setApiKey('')
      toast({
        title: 'Jev settings saved',
        description: enabled
          ? 'Jev judging is now enabled. Look for the "Judge with Jev" button in the AI Roundtable.'
          : 'Jev judging is now disabled.',
      })
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    setIsSaving(true)
    try {
      await fetch('/api/jev/config', { method: 'DELETE' })
      setConfig({ configured: false, enabled: false, hasKey: false })
      setEnabled(false)
      setApiKey('')
      toast({
        title: 'Jev removed',
        description: 'Jev configuration has been removed.',
      })
    } catch {
      toast({
        title: 'Remove failed',
        description: 'Could not remove Jev configuration.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading Jev settings...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Jev Decision Model
          {config?.enabled && <Badge variant="default">Enabled</Badge>}
          {config?.configured && !config?.enabled && <Badge variant="secondary">Configured</Badge>}
        </CardTitle>
        <CardDescription>
          TypeSafe AI&apos;s Jev is a decision model (not a chatbot) that picks the best
          response from multiple options. Fast (~200ms) and cheap (~$0.042/M tokens).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jev-api-key">TypeSafe API Key</Label>
          <Input
            id="jev-api-key"
            type="password"
            placeholder={config?.hasKey ? '•••••••• (key saved)' : 'Enter your TypeSafe API key'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Your key is encrypted before storage. Leave blank to keep the existing key.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="jev-enabled">Enable Jev judging</Label>
            <p className="text-xs text-muted-foreground">
              Show the &quot;Judge with Jev&quot; button in the AI Roundtable.
              Judging is always opt-in per click, never automatic.
            </p>
          </div>
          <input
            id="jev-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-gray-300"
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          {config?.configured && (
            <Button variant="outline" onClick={handleRemove} disabled={isSaving}>
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
