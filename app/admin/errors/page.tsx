"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { RefreshCw, AlertTriangle, AlertCircle, XCircle } from 'lucide-react'

// Define types
type ErrorCategory = 'validation' | 'network' | 'provider' | 'database' | 'authentication' | 'unknown'
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'
type Timeframe = '24h' | '7d' | '30d'

interface ErrorStats {
  total: number
  byCategory: Record<ErrorCategory, number>
  bySeverity: Record<ErrorSeverity, number>
  topErrors: Array<{ code: string; count: number }>
}

// Color mappings
const CATEGORY_COLORS: Record<ErrorCategory, string> = {
  validation: '#3B82F6',
  network: '#10B981',
  provider: '#F59E0B',
  database: '#EF4444',
  authentication: '#8B5CF6',
  unknown: '#6B7280'
}

const SEVERITY_COLORS: Record<ErrorSeverity, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#8B5CF6'
}

export default function ErrorDashboard() {
  const [stats, setStats] = useState<ErrorStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<Timeframe>('7d')

  const loadErrorStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const to = new Date()
      const from = new Date(to)
      
      switch (timeframe) {
        case '24h':
          from.setHours(from.getHours() - 24)
          break
        case '7d':
          from.setDate(from.getDate() - 7)
          break
        case '30d':
          from.setDate(from.getDate() - 30)
          break
      }

      const response = await fetch('/api/admin/errors/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from.toISOString(), to: to.toISOString() }),
      })

      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to load error stats:', error)
    } finally {
      setIsLoading(false)
    }
  }, [timeframe])

  useEffect(() => {
    loadErrorStats()
  }, [timeframe, loadErrorStats])

  const formatCategoryData = () => {
    if (!stats) return []
    
    return Object.entries(stats.byCategory).map(([category, count]) => ({
      name: category.replace('_', ' ').toUpperCase(),
      value: count,
      color: CATEGORY_COLORS[category as ErrorCategory],
    }))
  }

  const formatSeverityData = () => {
    if (!stats) return []
    
    return Object.entries(stats.bySeverity).map(([severity, count]) => ({
      name: severity.toUpperCase(),
      value: count,
      color: SEVERITY_COLORS[severity as ErrorSeverity],
    }))
  }

  const formatTopErrorsData = () => {
    if (!stats) return []
    
    return stats.topErrors.map(error => ({
      code: error.code,
      count: error.count,
    }))
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          Loading error statistics...
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
          <h3 className="text-lg font-medium mb-2">No Error Data</h3>
          <p className="text-gray-500">No error statistics available for the selected timeframe.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Error Dashboard</h1>
            <Badge variant="secondary">Live</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Review error volume, severity, and the most common codes.
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
          <Button variant="outline" onClick={loadErrorStats}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Severity</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.bySeverity.high + stats.bySeverity.critical}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Category</CardTitle>
            <XCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Frequent</CardTitle>
            <RefreshCw className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {stats.topErrors[0]?.code || 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Errors by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={formatCategoryData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" name="Error Count">
                  {formatCategoryData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Errors by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={formatSeverityData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {formatSeverityData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Error Codes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {formatTopErrorsData().map((error, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="font-medium">{error.code}</div>
                <Badge variant="secondary">{error.count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
