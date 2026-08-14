'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api-client'
import { getModelsForProvider } from '@/lib/model-catalog'
import { providerRegistry } from '@/lib/provider-registry'
import type { ProviderId } from '@/lib/providers'

type ProviderResponse = {
  provider: string
  model: string
  content: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number | null
  cost_label?: string
  latency_ms: number
}

type ProviderSelection = {
  provider: ProviderId
  model: string
  enabled: boolean
}

const providerIds = providerRegistry.map(provider => provider.id) as ProviderId[]

const PROVIDER_CATALOG = Object.fromEntries(
  providerRegistry.map(provider => [
    provider.id,
    {
      label: provider.name,
      description: provider.description,
      models: getModelsForProvider(provider.id).map(model => model.id),
    },
  ])
) as Record<ProviderId, { label: string; description: string; models: string[] }>

const samplePrompt =
  'Create a concise product launch plan for a multi-model AI assistant with timeline, risks, and success metrics.'

const isProviderId = (value: string): value is ProviderId =>
  providerIds.includes(value as ProviderId)

const createSelection = (provider: ProviderId): ProviderSelection => ({
  provider,
  model: PROVIDER_CATALOG[provider].models[0],
  enabled: true,
})

const buildSelections = (configuredProviders: string[]): ProviderSelection[] => {
  const validConfigured = configuredProviders.filter(isProviderId)
  const providers = validConfigured.length > 0 ? validConfigured : ['openai']
  return providers.map(provider => createSelection(provider as ProviderId))
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 6,
})

export default function PipelinePage() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingProviders, setIsLoadingProviders] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ProviderResponse[]>([])
  const [fallbackMode, setFallbackMode] = useState<string | null>(null)
  const [configuredProviders, setConfiguredProviders] = useState<ProviderId[]>(
    []
  )
  const [selections, setSelections] = useState<ProviderSelection[]>([])
  const [providerToAdd, setProviderToAdd] = useState<ProviderId>('openai')

  const loadConfiguredProviders = useCallback(async () => {
    setIsLoadingProviders(true)
    try {
      const response = await fetch('/api/config', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Failed to load provider configuration (HTTP ${response.status})`)
      }

      const data = (await response.json()) as { configuredProviders?: string[] }
      const validProviders = (data.configuredProviders || []).filter(isProviderId)
      setConfiguredProviders(validProviders)
      setSelections(buildSelections(validProviders))
    } catch (loadError) {
      console.error('Failed to load configured providers:', loadError)
      setConfiguredProviders([])
      setSelections(buildSelections([]))
      toast({
        title: 'Provider config unavailable',
        description: 'Using default provider set for orchestration.',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingProviders(false)
    }
  }, [toast])

  useEffect(() => {
    void loadConfiguredProviders()
  }, [loadConfiguredProviders])

  const availableToAdd = useMemo(() => {
    const selectedProviders = new Set(selections.map(selection => selection.provider))
    return providerIds.filter(provider => !selectedProviders.has(provider))
  }, [selections])

  useEffect(() => {
    if (availableToAdd.length === 0) return
    if (!availableToAdd.includes(providerToAdd)) {
      setProviderToAdd(availableToAdd[0])
    }
  }, [availableToAdd, providerToAdd])

  const activeSelections = useMemo(
    () => selections.filter(selection => selection.enabled),
    [selections]
  )

  const totalCost = useMemo(
    () =>
      results.reduce(
        (sum, result) => sum + (result.cost_usd ?? 0),
        0,
      ),
    [results]
  )

  const hasProviderBilledCost = results.some(
    (result) => result.cost_usd === null,
  )

  const averageLatency = useMemo(() => {
    if (results.length === 0) return 0
    return Math.round(
      results.reduce((sum, result) => sum + result.latency_ms, 0) / results.length
    )
  }, [results])

  const totalTokens = useMemo(
    () =>
      results.reduce(
        (sum, result) => sum + result.prompt_tokens + result.completion_tokens,
        0
      ),
    [results]
  )

  const setSelection = (index: number, partial: Partial<ProviderSelection>) => {
    setSelections(current =>
      current.map((selection, currentIndex) =>
        currentIndex === index ? { ...selection, ...partial } : selection
      )
    )
  }

  const addProvider = () => {
    if (!availableToAdd.includes(providerToAdd)) return
    setSelections(current => [...current, createSelection(providerToAdd)])
  }

  const removeProvider = (index: number) => {
    setSelections(current =>
      current.filter((_, currentIndex) => currentIndex !== index)
    )
  }

  const clearResults = () => {
    setResults([])
    setFallbackMode(null)
    setError(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const promptValue = prompt.trim()
    if (!promptValue) {
      setError('Enter a prompt before running orchestration.')
      return
    }

    if (activeSelections.length === 0) {
      setError('Enable at least one provider before running orchestration.')
      return
    }

    setIsLoading(true)
    setError(null)
    setFallbackMode(null)
    setResults([])

    try {
      const orchestrationRequest = {
        prompt: promptValue,
        requests: activeSelections.map(selection => ({
          provider: selection.provider,
          model: selection.model,
          prompt: promptValue,
        })),
      }

      const data = await apiClient.orchestrateWithMetadata(orchestrationRequest)
      setResults(data.results)
      setFallbackMode(data.fallbackMode)

      if (data.fallbackMode) {
        toast({
          title: 'Fallback mode active',
          description: `Using local orchestration (${data.fallbackMode}).`,
        })
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'An unknown error occurred.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="mx-auto max-w-6xl">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>LLM Orchestration Pipeline</CardTitle>
            <Badge variant="secondary">Interactive</Badge>
            {fallbackMode ? (
              <Badge variant="outline">Fallback: {fallbackMode}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            Send one prompt to multiple providers and compare outputs, latency,
            and estimated cost.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {configuredProviders.length === 0 && !isLoadingProviders ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              No providers are configured yet. Add API keys in{' '}
              <Link href="/settings" className="underline">
                Settings
              </Link>{' '}
              for the best results. The page currently defaults to OpenAI.
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              placeholder="Enter your prompt here..."
              className="min-h-[160px]"
            />

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Providers and Models</h3>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={providerToAdd}
                    onChange={event =>
                      setProviderToAdd(event.target.value as ProviderId)
                    }
                    disabled={availableToAdd.length === 0}
                  >
                    {availableToAdd.map(provider => (
                      <option key={provider} value={provider}>
                        {PROVIDER_CATALOG[provider].label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addProvider}
                    disabled={availableToAdd.length === 0}
                  >
                    Add Provider
                  </Button>
                </div>
              </div>

              {isLoadingProviders ? (
                <p className="text-sm text-muted-foreground">
                  Loading configured providers...
                </p>
              ) : null}

              <div className="space-y-3">
                {selections.map((selection, index) => {
                  const providerData = PROVIDER_CATALOG[selection.provider]
                  return (
                    <div
                      key={selection.provider}
                      className="rounded-md border border-border p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={selection.enabled}
                            onChange={event =>
                              setSelection(index, { enabled: event.target.checked })
                            }
                          />
                          {providerData.label}
                        </label>
                        <div className="flex items-center gap-2">
                          {configuredProviders.includes(selection.provider) ? (
                            <Badge variant="secondary">Configured</Badge>
                          ) : (
                            <Badge variant="outline">Not Configured</Badge>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeProvider(index)}
                            disabled={selections.length === 1}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      <p className="mb-2 text-xs text-muted-foreground">
                        {providerData.description}
                      </p>

                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={selection.model}
                        onChange={event =>
                          setSelection(index, { model: event.target.value })
                        }
                      >
                        {providerData.models.map(model => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Run Orchestration'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrompt(samplePrompt)}
                disabled={isLoading}
              >
                Use Sample Prompt
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearResults}
                disabled={isLoading}
              >
                Clear Results
              </Button>
            </div>
          </form>

          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Providers</p>
                    <p className="text-xl font-semibold">{results.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Avg Latency</p>
                    <p className="text-xl font-semibold">{averageLatency}ms</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Est. Cost</p>
                    <p className="text-xl font-semibold">
                      {currencyFormatter.format(totalCost)}
                      {hasProviderBilledCost ? ' + provider-billed' : ''}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-muted-foreground">
                Total estimated tokens processed: {totalTokens.toLocaleString()}
              </p>

              {results.map(result => (
                <Card key={`${result.provider}-${result.model}`} className="bg-muted/40">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {PROVIDER_CATALOG[result.provider as ProviderId]?.label ||
                        result.provider}{' '}
                      ({result.model})
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Latency: {result.latency_ms}ms | Prompt tokens:{' '}
                      {result.prompt_tokens.toLocaleString()} | Completion tokens:{' '}
                      {result.completion_tokens.toLocaleString()} | Cost:{' '}
                      {result.cost_usd === null
                        ? result.cost_label || 'Provider-billed'
                        : currencyFormatter.format(result.cost_usd)}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {result.content || 'No content returned.'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
