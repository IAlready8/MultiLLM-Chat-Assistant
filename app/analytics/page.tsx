'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  const { toast } = useToast()

  const loadAnalyticsData = useCallback(async () => {
    setLoading(true)
    try {
      // Simulate API call - in real implementation this would come from the backend
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Mock data based on timeframe
      const mockProviderData: ProviderUsage[] = [
        { provider: 'OpenAI', requests: 1250, tokens: 45000, errors: 3, avgResponseTime: 850 },
        { provider: 'Anthropic', requests: 980, tokens: 38000, errors: 1, avgResponseTime: 1200 },
        { provider: 'Google', requests: 750, tokens: 30000, errors: 2, avgResponseTime: 950 },
        { provider: 'OpenRouter', requests: 520, tokens: 22000, errors: 5, avgResponseTime: 1100 }
      ]
      
      const mockComparisonData: ModelComparison[] = [
        { provider: 'GPT-4', factualAccuracy: 4.5, creativity: 4.2, helpfulness: 4.7, coherence: 4.8, conciseness: 3.9 },
        { provider: 'Claude-3', factualAccuracy: 4.7, creativity: 4.5, helpfulness: 4.6, coherence: 4.9, conciseness: 4.2 },
        { provider: 'Gemini', factualAccuracy: 4.3, creativity: 4.0, helpfulness: 4.4, coherence: 4.5, conciseness: 4.1 },
        { provider: 'Llama', factualAccuracy: 3.8, creativity: 3.9, helpfulness: 4.0, coherence: 4.2, conciseness: 4.5 }
      ]
      
      const mockTrends: UsageTrend[] = [
        { date: 'Nov 1', requests: 120, tokens: 4500 },
        { date: 'Nov 2', requests: 180, tokens: 6200 },
        { date: 'Nov 3', requests: 95, tokens: 3800 },
        { date: 'Nov 4', requests: 210, tokens: 7800 },
        { date: 'Nov 5', requests: 165, tokens: 6100 }
      ]
      
      // Calculate totals
      const totals = mockProviderData.reduce((acc, curr) => {
        return {
          totalRequests: acc.totalRequests + curr.requests,
          totalTokens: acc.totalTokens + curr.tokens,
          totalErrors: acc.totalErrors + curr.errors,
          avgResponseTime: acc.avgResponseTime + curr.avgResponseTime
        }
      }, { totalRequests: 0, totalTokens: 0, totalErrors: 0, avgResponseTime: 0 })
      
      // Calculate average response time
      totals.avgResponseTime = Math.round(totals.avgResponseTime / mockProviderData.length)
      
      setProviderData(mockProviderData)
      setModelComparisonData(mockComparisonData)
      setUsageTrends(mockTrends)
      setTotalStats(totals)
    } catch (error) {
      console.error('Failed to load analytics data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadAnalyticsData()
  }, [loadAnalyticsData, timeframe])

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <Badge variant="secondary">Demo data</Badge>
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
          <Button variant="outline" onClick={loadAnalyticsData}>
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
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
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
