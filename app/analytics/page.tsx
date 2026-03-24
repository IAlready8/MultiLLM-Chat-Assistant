'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { RotateCcw, TrendingUp, Activity, Bot, Globe } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

// Define types for analytics data
type ProviderUsage = {
  provider: string
  requests: number
  tokens: number
  errors: number
  avgResponseTime: number
  date?: string
}

type ModelComparison = {
  provider: string
  factualAccuracy: number
  creativity: number
  helpfulness: number
  coherence: number
  conciseness: number
}

type UsageTrend = {
  date: string
  requests: number
  tokens: number
}

type WorkflowMetrics = {
  configuredProviders: number
  personas: number
  comparisonReadyConversations: number
  weeklySavedBriefComparisons: number
  conversationsCreated: number
  comparisonViews: number
  analyticsViews: number
}

type ActivationStep = {
  key: string
  label: string
  current: number
  target: number
  complete: boolean
}

const hasMeaningfulWorkflowProgress = (metrics: WorkflowMetrics) =>
  metrics.configuredProviders > 0 ||
  metrics.personas > 0 ||
  metrics.comparisonReadyConversations > 0 ||
  metrics.weeklySavedBriefComparisons > 0 ||
  metrics.conversationsCreated > 0

type AnalyticsApiResponse = {
  timeframe: '24h' | '7d' | '30d'
  providerData: ProviderUsage[]
  modelComparisonData: ModelComparison[]
  usageTrends: UsageTrend[]
  totalStats: {
    totalRequests: number
    totalTokens: number
    totalErrors: number
    avgResponseTime: number
  }
  workflowMetrics: WorkflowMetrics
  activationFunnel: ActivationStep[]
  meta?: {
    source?: 'live' | 'empty'
    eventCount?: number
  }
}

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d'>('7d')
  const [loading, setLoading] = useState(true)
  const [providerData, setProviderData] = useState<ProviderUsage[]>([])
  const [modelComparisonData, setModelComparisonData] = useState<ModelComparison[]>([])
  const [usageTrends, setUsageTrends] = useState<UsageTrend[]>([])
  const [totalStats, setTotalStats] = useState({
    totalRequests: 0,
    totalTokens: 0,
    totalErrors: 0,
    avgResponseTime: 0
  })
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetrics>({
    configuredProviders: 0,
    personas: 0,
    comparisonReadyConversations: 0,
    weeklySavedBriefComparisons: 0,
    conversationsCreated: 0,
    comparisonViews: 0,
    analyticsViews: 0,
  })
  const [activationFunnel, setActivationFunnel] = useState<ActivationStep[]>([])
  const [isTelemetryEmpty, setIsTelemetryEmpty] = useState(false)
  const [sourceLabel, setSourceLabel] = useState<'Live data' | 'No telemetry yet'>('Live data')
  const [loadError, setLoadError] = useState<string | null>(null)
  const { toast } = useToast()

  const loadAnalyticsData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(
        `/api/analytics?timeframe=${timeframe}&source=analytics`,
        {
        method: 'GET',
        cache: 'no-store',
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to load analytics (${response.status})`)
      }

      const data = (await response.json()) as AnalyticsApiResponse
      setProviderData(data.providerData || [])
      setModelComparisonData(data.modelComparisonData || [])
      setUsageTrends(data.usageTrends || [])
      setTotalStats(
        data.totalStats || {
          totalRequests: 0,
          totalTokens: 0,
          totalErrors: 0,
          avgResponseTime: 0,
        }
      )
      setWorkflowMetrics(
        data.workflowMetrics || {
          configuredProviders: 0,
          personas: 0,
          comparisonReadyConversations: 0,
          weeklySavedBriefComparisons: 0,
          conversationsCreated: 0,
          comparisonViews: 0,
          analyticsViews: 0,
        }
      )
      setActivationFunnel(data.activationFunnel || [])
      const source = data.meta?.source
      const hasWorkflowProgress =
        (data.activationFunnel || []).some(step => step.current > 0) ||
        hasMeaningfulWorkflowProgress(
          data.workflowMetrics || {
            configuredProviders: 0,
            personas: 0,
            comparisonReadyConversations: 0,
            weeklySavedBriefComparisons: 0,
            conversationsCreated: 0,
            comparisonViews: 0,
            analyticsViews: 0,
          }
        )
      const inferredEmpty =
        (data.providerData?.length ?? 0) === 0 &&
        (data.modelComparisonData?.length ?? 0) === 0 &&
        (data.totalStats?.totalRequests ?? 0) === 0 &&
        !hasWorkflowProgress
      setIsTelemetryEmpty(source === 'empty' && inferredEmpty)
      setSourceLabel(data.meta?.source === 'empty' ? 'No telemetry yet' : 'Live data')
    } catch (err) {
      console.error('Failed to load analytics data:', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load analytics data')
      toast({
        title: 'Error',
        description: 'Failed to load analytics data. Use the refresh button to retry.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [timeframe, toast])

  useEffect(() => {
    loadAnalyticsData()
  }, [loadAnalyticsData])

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']
  const successRate = totalStats.totalRequests > 0
    ? ((totalStats.totalRequests - totalStats.totalErrors) / totalStats.totalRequests) * 100
    : 100

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RotateCcw className="h-6 w-6 animate-spin mr-2" />
          Loading analytics...
        </div>
      </div>
    )
  }

  const hasUsageTrendData = usageTrends.some(
    point => point.requests > 0 || point.tokens > 0
  )
  const activationCompletionRate =
    activationFunnel.length > 0
      ? Math.round(
          (activationFunnel.filter(step => step.complete).length / activationFunnel.length) *
            100
        )
      : 0
  const hasData =
    providerData.length > 0 ||
    modelComparisonData.length > 0 ||
    totalStats.totalRequests > 0 ||
    hasUsageTrendData ||
    activationFunnel.some(step => step.current > 0) ||
    hasMeaningfulWorkflowProgress(workflowMetrics)

  if (loadError && !hasData) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Unable to Load Analytics</h3>
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Button onClick={loadAnalyticsData}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!hasData && isTelemetryEmpty) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Telemetry Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start using the Multi-Chat or Pipeline features to generate analytics data.
            </p>
            <Button variant="outline" onClick={loadAnalyticsData}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <Badge variant="secondary">{sourceLabel}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor usage, latency, and quality trends across providers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={timeframe === '24h' ? 'default' : 'outline'}
            onClick={() => setTimeframe('24h')}
          >
            24H
          </Button>
          <Button
            variant={timeframe === '7d' ? 'default' : 'outline'}
            onClick={() => setTimeframe('7d')}
          >
            7D
          </Button>
          <Button
            variant={timeframe === '30d' ? 'default' : 'outline'}
            onClick={() => setTimeframe('30d')}
          >
            30D
          </Button>
          <Button
            variant="outline"
            onClick={loadAnalyticsData}
            aria-label="Refresh analytics"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalRequests.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">+12% from last period</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Generated</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">+8% from last period</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {successRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">{totalStats.totalErrors} errors</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Response Time</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.avgResponseTime}ms</div>
            <p className="text-xs text-muted-foreground mt-1">Across all providers</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Core Workflow</CardTitle>
            <CardDescription>
              Track the locked KPI and the actions that lead to repeat comparisons.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">
                Weekly Saved Brief Comparisons
              </div>
              <div className="text-2xl font-bold">
                {workflowMetrics.weeklySavedBriefComparisons}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Comparison-ready conversations
              </div>
              <div className="text-2xl font-bold">
                {workflowMetrics.comparisonReadyConversations}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Conversations created</div>
              <div className="text-2xl font-bold">
                {workflowMetrics.conversationsCreated}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Comparison views</div>
              <div className="text-2xl font-bold">{workflowMetrics.comparisonViews}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activation Funnel</CardTitle>
            <CardDescription>
              Progress toward the first repeatable comparison workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Completion</span>
                <span>{activationCompletionRate}%</span>
              </div>
              <Progress value={activationCompletionRate} />
            </div>
            <div className="space-y-3">
              {activationFunnel.map((step) => {
                const percent = Math.min(
                  100,
                  Math.round((step.current / Math.max(step.target, 1)) * 100)
                )
                return (
                  <div key={step.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{step.label}</span>
                      <span className="text-muted-foreground">
                        {step.current}/{step.target}
                      </span>
                    </div>
                    <Progress value={percent} />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Trends</CardTitle>
          <CardDescription>Requests and tokens over the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={usageTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="requests" name="Requests" fill="#3B82F6" />
              <Bar dataKey="tokens" name="Tokens Generated" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Provider Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Provider Usage</CardTitle>
            <CardDescription>Requests and performance by provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providerData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="provider" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="requests" name="Requests" fill="#3B82F6" />
                <Bar dataKey="avgResponseTime" name="Avg. Response Time (ms)" fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Provider Error Rates</CardTitle>
            <CardDescription>Errors by provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={providerData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="errors"
                  nameKey="provider"
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {providerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Model Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Model Comparison</CardTitle>
          <CardDescription>Performance metrics across different LLMs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {modelComparisonData.map((model, index) => (
              <div key={model.provider} className="space-y-2">
                <h4 className="font-medium">{model.provider}</h4>
                <div className="grid grid-cols-5 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Factual Accuracy</div>
                    <div className="text-lg">{model.factualAccuracy}/5</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Creativity</div>
                    <div className="text-lg">{model.creativity}/5</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Helpfulness</div>
                    <div className="text-lg">{model.helpfulness}/5</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Coherence</div>
                    <div className="text-lg">{model.coherence}/5</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Conciseness</div>
                    <div className="text-lg">{model.conciseness}/5</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
