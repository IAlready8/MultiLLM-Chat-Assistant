'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { operationalProviderRegistry } from '@/lib/provider-registry'

type ProviderStatus = 'unknown' | 'connected' | 'disconnected'

type KeyTestResult = {
  valid: boolean
  message: string
  latencyMs?: number
}

const INITIAL_PROVIDER_STATUS = Object.fromEntries(
  operationalProviderRegistry.map(provider => [provider.id, 'unknown'])
) as Record<string, ProviderStatus>

const UNREACHABLE_MESSAGE =
  'The verification service could not be reached. Nothing was tested. Try again shortly.'

const readResult = (value: unknown): KeyTestResult | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { valid?: unknown; message?: unknown; error?: unknown; latencyMs?: unknown }
  const message =
    typeof candidate.message === 'string'
      ? candidate.message
      : typeof candidate.error === 'string'
        ? candidate.error
        : null
  if (!message) return null
  return {
    valid: candidate.valid === true,
    message,
    ...(typeof candidate.latencyMs === 'number' ? { latencyMs: candidate.latencyMs } : {}),
  }
}

export default function ApiTestPage() {
  const [provider, setProvider] = useState(operationalProviderRegistry[0]?.id ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<KeyTestResult | null>(null)
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>(
    INITIAL_PROVIDER_STATUS
  )

  const selectedProvider = operationalProviderRegistry.find(item => item.id === provider)

  const testApi = async () => {
    setIsLoading(true)
    setResult(null)
    const trimmedKey = apiKey.trim()

    try {
      // A typed key is verified as entered and is not saved. With no key
      // typed, the key already saved in Settings is verified server-side.
      const response = await fetch('/api/test-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          trimmedKey ? { provider, apiKey: trimmedKey } : { provider, testSaved: true }
        ),
      })
      const parsed = readResult(await response.json().catch(() => null))
      if (!parsed) {
        // No verdict came back, so the provider status stays as it was.
        setResult({ valid: false, message: UNREACHABLE_MESSAGE })
        return
      }
      setResult(parsed)
      // Only a real verdict from the provider check moves the status badge.
      if (response.ok) {
        setProviderStatus(prev => ({
          ...prev,
          [provider]: parsed.valid ? 'connected' : 'disconnected',
        }))
      }
    } catch {
      setResult({ valid: false, message: UNREACHABLE_MESSAGE })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">API Configuration Test</h1>
        <p className="text-sm text-muted-foreground">
          Verify a provider API key against the provider before running live chats.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run a connectivity check</CardTitle>
          <CardDescription>
            The check contacts the provider with the key. It does not send a prompt
            and does not use your monthly generation allowance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="api-test-provider">Provider</Label>
            <select
              id="api-test-provider"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value)
                setResult(null)
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {operationalProviderRegistry.map(providerOption => (
                <option key={providerOption.id} value={providerOption.id}>
                  {providerOption.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-test-key">API key (optional)</Label>
            <Input
              id="api-test-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              maxLength={512}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={selectedProvider?.placeholder ?? 'API key'}
            />
            <p className="text-xs text-muted-foreground">
              Leave this empty to verify the key you saved in Settings. A key typed
              here is checked once and is not saved.
            </p>
          </div>

          <Button className="w-full" onClick={testApi} disabled={isLoading}>
            {isLoading ? 'Testing...' : 'Test API Connection'}
          </Button>

          {result && (
            <div
              role={result.valid ? 'status' : 'alert'}
              className={`rounded-md border p-4 text-sm ${
                result.valid ? 'border-border bg-muted' : 'border-destructive/50 text-destructive'
              }`}
            >
              <p className="font-medium">{result.valid ? 'Verified' : 'Not verified'}</p>
              <p>{result.message}</p>
              {result.latencyMs !== undefined && result.latencyMs > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Provider responded in {Math.round(result.latencyMs)} ms.
                </p>
              ) : null}
            </div>
          )}

          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-base">Provider Status</CardTitle>
              <CardDescription>Results of the checks run on this page in this visit.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {operationalProviderRegistry.map(providerOption => {
                  const status = providerStatus[providerOption.id]
                  const label = status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Disconnected' : 'Not tested'
                  const variant = status === 'connected' ? 'default' : status === 'disconnected' ? 'destructive' : 'secondary'

                  return (
                    <Badge key={providerOption.id} variant={variant}>
                      {providerOption.name}: {label}
                    </Badge>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}
