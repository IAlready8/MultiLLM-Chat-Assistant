'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { getModelsForProvider } from '@/lib/model-catalog'
import {
  isProviderApiKeyRequired,
  operationalProviderRegistry,
  supportedProviderIds,
} from '@/lib/provider-registry'

type ProviderStatus = 'unknown' | 'connected' | 'disconnected'
type ProviderId = (typeof supportedProviderIds)[number]
type TestApiKeyResult = {
  valid: boolean
  message: string
  reason?: string
  latencyMs?: number
}

const PROVIDER_OPTIONS = operationalProviderRegistry
  .map(provider => ({
    ...provider,
    models: getModelsForProvider(provider.id).map(model => model.id),
  }))
  .filter(provider => provider.models.length > 0)

const MODEL_OPTIONS = Object.fromEntries(
  PROVIDER_OPTIONS.map(provider => [provider.id, provider.models])
) as Record<ProviderId, string[]>

const INITIAL_PROVIDER_STATUS = Object.fromEntries(
  PROVIDER_OPTIONS.map(provider => [provider.id, 'unknown'])
) as Record<ProviderId, ProviderStatus>

const PROVIDER_LABELS = Object.fromEntries(
  PROVIDER_OPTIONS.map(provider => [provider.id, provider.name])
) as Record<ProviderId, string>

const DEFAULT_PROVIDER: ProviderId = PROVIDER_OPTIONS[0]?.id ?? 'openai'

export default function ApiTestPage() {
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [model, setModel] = useState(MODEL_OPTIONS[DEFAULT_PROVIDER]?.[0] ?? '')
  const [prompt, setPrompt] = useState('Hello, how are you?')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [providerStatus, setProviderStatus] =
    useState<Record<ProviderId, ProviderStatus>>(INITIAL_PROVIDER_STATUS)
  const { toast } = useToast()

  const handleProviderChange = (nextProvider: string) => {
    if (!supportedProviderIds.includes(nextProvider as ProviderId)) {
      return
    }
    const normalizedProvider = nextProvider as ProviderId
    setProvider(normalizedProvider)
    const nextModels = MODEL_OPTIONS[normalizedProvider] || []
    if (nextModels.length > 0) {
      setModel(nextModels[0])
    }
  }

  const testApi = async () => {
    setIsLoading(true)
    setResponse('')

    try {
      if (!apiKey.trim() && isProviderApiKeyRequired(provider)) {
        setProviderStatus(prev => ({ ...prev, [provider]: 'disconnected' }))
        toast({
          title: 'Missing API key',
          description: 'Enter an API key to run a provider connectivity test.',
          variant: 'destructive'
        })
        return
      }

      const resultResponse = await fetch('/api/test-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey }),
      })
      const result = (await resultResponse.json()) as TestApiKeyResult
      const valid = resultResponse.ok && result.valid

      setResponse([
        result.message,
        `Provider: ${PROVIDER_LABELS[provider] ?? provider}`,
        `Model selected for later chat runs: ${model}`,
        result.latencyMs !== undefined ? `Latency: ${result.latencyMs}ms` : null,
        result.reason ? `Reason: ${result.reason}` : null,
        prompt.trim() ? `Prompt retained for manual chat test: "${prompt.trim()}"` : null,
      ].filter(Boolean).join('\n'))
      setProviderStatus(prev => ({
        ...prev,
        [provider]: valid ? 'connected' : 'disconnected',
      }))

      toast({
        title: valid ? 'Provider verified' : 'Provider check failed',
        description: result.message,
        variant: valid ? undefined : 'destructive',
      })
    } catch (error) {
      console.error('API test error:', error)
      setResponse('Error occurred during API test')
      setProviderStatus(prev => ({ ...prev, [provider]: 'disconnected' }))
      toast({
        title: 'Error',
        description: 'Failed to complete API test',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">API Configuration Test</h1>
          <Badge variant="secondary">Live key check</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Test provider keys before running live chats.
        </p>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Run a connectivity check</CardTitle>
            <CardDescription>Verify the key format and provider reachability.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Provider</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PROVIDER_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {(MODEL_OPTIONS[provider] || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
	            <label className="text-sm font-medium mb-2 block">Reference Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
	              placeholder="Enter a prompt to retain with this check..."
              rows={3}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">API Key (for testing)</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key for testing"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Note: This is just for testing. In the full app, API keys are securely stored.
            </p>
          </div>
          
          <Button className="w-full" onClick={testApi} disabled={isLoading}>
            {isLoading ? 'Testing...' : 'Test API Connection'}
          </Button>
          
          {response && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">API Response</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap p-4 bg-muted rounded-md">
                  {response}
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-base">Provider Status</CardTitle>
              <CardDescription>Track connectivity checks per provider.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_OPTIONS.map((option) => {
                  const id = option.id
                  const status = providerStatus[id]
                  const label = status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Disconnected' : 'Not tested'
                  const variant = status === 'connected' ? 'default' : status === 'disconnected' ? 'destructive' : 'secondary'

                  return (
                    <Badge key={id} variant={variant}>
                      {option.name}: {label}
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
