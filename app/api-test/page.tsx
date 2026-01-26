'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'

type ProviderStatus = 'unknown' | 'connected' | 'disconnected'

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  googleai: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  openrouter: ['openrouter/auto', 'gryphe/mythomax-l2-13b'],
  grok: ['grok-beta', 'grok-2-1212']
}

export default function ApiTestPage() {
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o')
  const [prompt, setPrompt] = useState('Hello, how are you?')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>({
    openai: 'unknown',
    anthropic: 'unknown',
    googleai: 'unknown',
    openrouter: 'unknown',
    grok: 'unknown'
  })
  const { toast } = useToast()

  const handleProviderChange = (nextProvider: string) => {
    setProvider(nextProvider)
    const nextModels = MODEL_OPTIONS[nextProvider] || []
    if (nextModels.length > 0) {
      setModel(nextModels[0])
    }
  }

  const testApi = async () => {
    setIsLoading(true)
    setResponse('')

    try {
      if (!apiKey.trim()) {
        setProviderStatus(prev => ({ ...prev, [provider]: 'disconnected' }))
        toast({
          title: 'Missing API key',
          description: 'Enter an API key to run a simulated connectivity test.',
          variant: 'destructive'
        })
        return
      }

      // This would call the actual API in a real implementation
      // For now, we'll simulate a response without an artificial delay.
      setResponse(`This is a simulated response from ${provider} using model ${model}. You asked: "${prompt}"`)
      setProviderStatus(prev => ({ ...prev, [provider]: 'connected' }))

      toast({
        title: 'Success',
        description: `API test completed for ${provider}`
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
          <Badge variant="secondary">Simulated</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Test your API configurations and connections before running live chats.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run a connectivity check</CardTitle>
          <CardDescription>Use a test prompt to confirm provider access.</CardDescription>
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
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="googleai">Google AI (Gemini)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="grok">Grok (xAI)</option>
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
            <label className="text-sm font-medium mb-2 block">Test Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a test prompt to send to the API..."
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
                {(['openai', 'anthropic', 'googleai', 'openrouter', 'grok'] as const).map((id) => {
                  const status = providerStatus[id]
                  const label = status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Disconnected' : 'Not tested'
                  const variant = status === 'connected' ? 'default' : status === 'disconnected' ? 'destructive' : 'secondary'
                  const name = id === 'googleai' ? 'Google AI' : id === 'grok' ? 'Grok (xAI)' : id.charAt(0).toUpperCase() + id.slice(1)

                  return (
                    <Badge key={id} variant={variant}>
                      {name}: {label}
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
