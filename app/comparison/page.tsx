'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api-client'
import type { Conversation, Message } from '@/types/prisma'

type DashboardProviderUsage = {
  provider: string
  requests: number
  tokens: number
  errors: number
  avgResponseTime: number
}

type DashboardModelMetrics = {
  provider: string
  factualAccuracy: number
  creativity: number
  helpfulness: number
  coherence: number
  conciseness: number
}

type AnalyticsResponse = {
  providerData: DashboardProviderUsage[]
  modelComparisonData: DashboardModelMetrics[]
  meta?: {
    source?: 'live' | 'empty'
  }
}

interface ComparisonModel {
  id: string
  name: string
  provider: string
  responseTime: number
  tokensPerSecond: number
  accuracy: number
  cost: number
  usageCount: number
}

type ResponseSample = {
  model: string
  provider: string
  content: string
}

const COST_PER_1K_TOKENS: Record<string, number> = {
  openai: 0.03,
  anthropic: 0.015,
  'google ai': 0.001,
  googleai: 0.001,
  openrouter: 0.01,
  grok: 0.02,
}

const normalizeKey = (value: string) => value.toLowerCase().trim()

const inferProviderFromName = (name: string) => {
  const key = normalizeKey(name)
  if (key.includes('gpt') || key.includes('openai')) return 'OpenAI'
  if (key.includes('claude') || key.includes('anthropic')) return 'Anthropic'
  if (key.includes('gemini') || key.includes('google')) return 'Google AI'
  if (key.includes('grok')) return 'Grok'
  if (key.includes('openrouter')) return 'OpenRouter'
  return name
}

const round = (value: number, precision = 2) => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const buildModelRows = (
  providerData: DashboardProviderUsage[],
  modelData: DashboardModelMetrics[]
): ComparisonModel[] => {
  const providerLookup = new Map(
    providerData.map((provider) => [normalizeKey(provider.provider), provider])
  )

  const rowsFromModels = modelData.map((model) => {
    const providerName = inferProviderFromName(model.provider)
    const providerUsage =
      providerLookup.get(normalizeKey(providerName)) ??
      providerLookup.get(normalizeKey(model.provider))

    const usageCount = providerUsage?.requests ?? 0
    const responseTime = providerUsage?.avgResponseTime ?? 0
    const avgTokens =
      providerUsage && providerUsage.requests > 0
        ? providerUsage.tokens / providerUsage.requests
        : 0
    const tokensPerSecond =
      responseTime > 0 ? Math.round(avgTokens / (responseTime / 1000)) : 0
    const providerKey = normalizeKey(providerName)
    const fallbackCost = COST_PER_1K_TOKENS[providerKey] ?? 0
    const inferredCost =
      providerUsage && providerUsage.tokens > 0 && usageCount > 0
        ? (providerUsage.tokens / 1000) * fallbackCost / usageCount
        : fallbackCost

    return {
      id: normalizeKey(model.provider).replace(/\s+/g, '-'),
      name: model.provider,
      provider: providerName,
      responseTime,
      tokensPerSecond,
      accuracy: round(model.factualAccuracy * 20, 1),
      cost: round(inferredCost, 4),
      usageCount,
    }
  })

  if (rowsFromModels.length > 0) {
    return rowsFromModels.sort((a, b) => b.usageCount - a.usageCount)
  }

  return providerData.map((provider) => {
    const requests = Math.max(provider.requests, 1)
    const avgTokens = provider.tokens / requests
    const tokensPerSecond =
      provider.avgResponseTime > 0
        ? Math.round(avgTokens / (provider.avgResponseTime / 1000))
        : 0
    const errorRate = provider.errors / requests
    const accuracy = round(Math.max(60, 100 - errorRate * 100), 1)
    const cost = COST_PER_1K_TOKENS[normalizeKey(provider.provider)] ?? 0

    return {
      id: normalizeKey(provider.provider).replace(/\s+/g, '-'),
      name: provider.provider,
      provider: provider.provider,
      responseTime: provider.avgResponseTime,
      tokensPerSecond,
      accuracy,
      cost: round(cost, 4),
      usageCount: provider.requests,
    }
  })
}

const extractConversationSamples = (
  messages: Message[]
): { prompt: string; responses: ResponseSample[] } => {
  const latestUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'user')
    .pop()?.index

  const prompt =
    latestUserIndex === undefined
      ? 'No user prompt found in this conversation.'
      : messages[latestUserIndex]?.content || 'No prompt text available.'

  const scopedMessages =
    latestUserIndex === undefined
      ? messages
      : messages.slice(latestUserIndex + 1)

  const assistantMessages = scopedMessages.filter(
    (message) => message.role === 'assistant' && message.content.trim().length > 0
  )

  const responseMap = new Map<string, ResponseSample>()
  for (const message of assistantMessages.reverse()) {
    const provider = message.provider || 'Unknown provider'
    const model = message.model || provider
    const key = `${provider}:${model}`
    if (responseMap.has(key)) {
      continue
    }
    responseMap.set(key, {
      model,
      provider,
      content: message.content,
    })
  }

  return {
    prompt,
    responses: Array.from(responseMap.values()),
  }
}

export default function ComparisonPage() {
  const [activeTab, setActiveTab] = useState('models')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState<'Live data' | 'No telemetry yet'>(
    'Live data'
  )
  const [comparisonData, setComparisonData] = useState<ComparisonModel[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string>('')
  const [selectedPrompt, setSelectedPrompt] = useState('Select a conversation to compare responses.')
  const [responseSamples, setResponseSamples] = useState<ResponseSample[]>([])
  const [loadingResponses, setLoadingResponses] = useState(false)

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/analytics?timeframe=30d&source=comparison', {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error(`Failed to load analytics (${response.status})`)
      }

      const data = (await response.json()) as AnalyticsResponse
      setComparisonData(buildModelRows(data.providerData || [], data.modelComparisonData || []))
      setSourceLabel(data.meta?.source === 'empty' ? 'No telemetry yet' : 'Live data')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison data')
      setComparisonData([])
      setSourceLabel('No telemetry yet')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiClient.getConversations()
      setConversations(data)
      if (data.length > 0) {
        setSelectedConversationId((current) => current || data[0].id)
      } else {
        setSelectedConversationId('')
        setSelectedPrompt('No conversations available yet.')
        setResponseSamples([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations')
      setConversations([])
      setSelectedConversationId('')
      setSelectedPrompt('Unable to load conversations.')
      setResponseSamples([])
    }
  }, [])

  const loadConversationComparison = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      setSelectedPrompt('No conversation selected.')
      setResponseSamples([])
      return
    }

    setLoadingResponses(true)
    try {
      const conversation = await apiClient.getConversation(conversationId)
      const { prompt, responses } = extractConversationSamples(conversation.messages)
      setSelectedPrompt(prompt)
      setResponseSamples(responses)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation details')
      setSelectedPrompt('Unable to load selected conversation.')
      setResponseSamples([])
    } finally {
      setLoadingResponses(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([loadMetrics(), loadConversations()])
  }, [loadMetrics, loadConversations])

  useEffect(() => {
    if (!selectedConversationId) {
      return
    }
    void loadConversationComparison(selectedConversationId)
  }, [selectedConversationId, loadConversationComparison])

  const modelTableRows = useMemo(
    () => comparisonData.slice().sort((a, b) => b.usageCount - a.usageCount),
    [comparisonData]
  )

  const renderModelComparison = () => {
    if (loading) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading model metrics...</p>
          </CardContent>
        </Card>
      )
    }

    if (modelTableRows.length === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No model telemetry found yet. Run some prompts in Multi-Chat to populate this view.
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {modelTableRows.map((model) => (
            <Card key={model.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{model.name}</CardTitle>
                  <Badge variant="outline">{model.provider}</Badge>
                </div>
                <CardDescription>{model.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Response Time</span>
                    <span className="text-sm font-medium">
                      {model.responseTime > 0 ? `${model.responseTime}ms` : 'N/A'}
                    </span>
                  </div>
                  <Progress
                    value={model.responseTime > 0 ? Math.max(0, (1 - model.responseTime / 2500) * 100) : 0}
                    className="h-2"
                  />

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tokens/Sec</span>
                    <span className="text-sm font-medium">{model.tokensPerSecond}</span>
                  </div>
                  <Progress value={Math.min(100, (model.tokensPerSecond / 200) * 100)} className="h-2" />

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Accuracy</span>
                    <span className="text-sm font-medium">{model.accuracy}%</span>
                  </div>
                  <Progress value={model.accuracy} className="h-2" />

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Est. Cost per 1K tokens</span>
                    <span className="text-sm font-medium">${model.cost.toFixed(4)}</span>
                  </div>

                  <div className="flex justify-between pt-2">
                    <span className="text-sm text-muted-foreground">Usage Count</span>
                    <span className="text-sm font-medium">{model.usageCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Overall Comparison</CardTitle>
            <CardDescription>Side-by-side comparison of model performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Model</th>
                    <th className="text-left py-2">Provider</th>
                    <th className="text-left py-2">Response Time</th>
                    <th className="text-left py-2">Tokens/Sec</th>
                    <th className="text-left py-2">Accuracy</th>
                    <th className="text-left py-2">Cost (1K tokens)</th>
                  </tr>
                </thead>
                <tbody>
                  {modelTableRows.map((model) => (
                    <tr key={model.id} className="border-b">
                      <td className="py-2 font-medium">{model.name}</td>
                      <td className="py-2">{model.provider}</td>
                      <td className="py-2">
                        {model.responseTime > 0 ? `${model.responseTime}ms` : 'N/A'}
                      </td>
                      <td className="py-2">{model.tokensPerSecond}</td>
                      <td className="py-2">{model.accuracy}%</td>
                      <td className="py-2">${model.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderConversationComparison = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Conversation Comparison</CardTitle>
          <CardDescription>
            Compare real assistant responses captured from a selected conversation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedConversationId}
              onChange={(event) => setSelectedConversationId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {conversations.length === 0 && (
                <option value="">No conversations available</option>
              )}
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => void loadConversations()}>
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-medium mb-2">Prompt</h3>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                {selectedPrompt}
              </p>
            </div>
            <div className="space-y-4">
              {loadingResponses && (
                <p className="text-sm text-muted-foreground">Loading responses...</p>
              )}
              {!loadingResponses && responseSamples.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No provider-tagged assistant responses found in this conversation.
                </p>
              )}
              {!loadingResponses &&
                responseSamples.map((sample) => (
                  <div key={`${sample.provider}:${sample.model}`} className="border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium">{sample.model}</h4>
                      <Badge variant="outline">{sample.provider}</Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{sample.content}</p>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Model Comparison</h1>
          <Badge variant="secondary">{sourceLabel}</Badge>
        </div>
        <p className="text-muted-foreground mt-2">
          Compare real performance metrics and side-by-side responses across providers.
        </p>
        {error && (
          <div className="flex items-center gap-3 mt-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void Promise.all([loadMetrics(), loadConversations()])}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="models">Model Metrics</TabsTrigger>
          <TabsTrigger value="conversations">Response Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          {renderModelComparison()}
        </TabsContent>

        <TabsContent value="conversations" className="space-y-4">
          {renderConversationComparison()}
        </TabsContent>
      </Tabs>
    </div>
  )
}
