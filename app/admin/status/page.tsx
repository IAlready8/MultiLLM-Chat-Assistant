'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle,
  XCircle,
  Clock,
  Server,
  Database,
  Shield,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type CheckStatus = 'ok' | 'warning' | 'error'

type SystemCheck = {
  id: string
  name: string
  description: string
  status: CheckStatus
  message: string
  responseTimeMs: number
}

type SystemStatusResponse = {
  generatedAt: string
  overallStatus: CheckStatus
  checks: SystemCheck[]
  systemInfo: {
    app: string
    environment: string
    nodeVersion: string
    strictAuth: boolean
    databaseUrlConfigured: boolean
    stripe: {
      apiConfigured: boolean
      checkoutConfigured: boolean
      webhookConfigured: boolean
    }
    rateLimit: {
      mode: 'redis' | 'memory'
      redisConfigured: boolean
      redisConnected: boolean
      inMemoryKeys: number
    }
  }
}

const CHECK_ICONS: Record<string, LucideIcon> = {
  api: Server,
  database: Database,
  auth: Shield,
  storage: Database,
  'rate-limit': Clock,
  security: Shield,
}

const getStatusColor = (status: CheckStatus) => {
  switch (status) {
    case 'ok':
      return 'bg-green-500'
    case 'warning':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

const renderStatusIcon = (status: CheckStatus, className: string) => {
  const Icon = status === 'ok' ? CheckCircle : status === 'error' ? XCircle : Clock
  return <Icon className={className} />
}

export default function SystemStatusPage() {
  const [statusData, setStatusData] = useState<SystemStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadSystemStatus = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/admin/status', {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Failed to load status (${response.status})`)
      }

      const payload = (await response.json()) as SystemStatusResponse
      setStatusData(payload)
    } catch (error) {
      console.error('Failed to load system status:', error)
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load system status'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSystemStatus()
  }, [loadSystemStatus])

  if (isLoading && !statusData) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading system status...
        </div>
      </div>
    )
  }

  if (!statusData) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span>{loadError || 'System status is currently unavailable.'}</span>
              </div>
              <Button onClick={loadSystemStatus} variant="outline" size="sm">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const checks = statusData.checks
  const overallStatus = statusData.overallStatus
  const statusColor = getStatusColor(overallStatus)

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="mb-6">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            {renderStatusIcon(
              overallStatus,
              `h-12 w-12 ${
                overallStatus === 'ok'
                  ? 'text-green-500'
                  : overallStatus === 'error'
                    ? 'text-red-500'
                    : 'text-yellow-500'
              }`
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="text-2xl">System Status</CardTitle>
            <Badge variant="secondary">Live</Badge>
          </div>
          <CardDescription>
            Current operational status of all system components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-medium">Overall System Health</span>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  overallStatus === 'ok'
                    ? 'default'
                    : overallStatus === 'error'
                      ? 'destructive'
                      : 'secondary'
                }
                className="capitalize"
              >
                {overallStatus}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSystemStatus}
                disabled={isLoading}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {checks.map((check) => {
              const checkStatusColor = getStatusColor(check.status)
              const CheckIcon = CHECK_ICONS[check.id] || Shield

              return (
                <div key={check.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                  <div className={`p-2 rounded-full ${checkStatusColor} bg-opacity-20`}>
                    <CheckIcon className={`h-5 w-5 ${checkStatusColor.replace('bg', 'text')}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{check.name}</h3>
                      <Badge
                        variant={
                          check.status === 'ok'
                            ? 'default'
                            : check.status === 'error'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="capitalize"
                      >
                        {check.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {check.description}
                    </p>
                    <p className="text-sm mt-2 flex items-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-2 ${checkStatusColor}`}
                      />
                      {check.message} ({check.responseTimeMs}ms)
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Details about the current system configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Application</h4>
              <p className="text-sm text-muted-foreground">{statusData.systemInfo.app}</p>
              <p className="text-sm text-muted-foreground">
                Status generated at: {new Date(statusData.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Runtime</h4>
              <p className="text-sm text-muted-foreground">
                Environment: {statusData.systemInfo.environment}
              </p>
              <p className="text-sm text-muted-foreground">
                Node.js {statusData.systemInfo.nodeVersion}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Database & Auth</h4>
              <p className="text-sm text-muted-foreground">
                Database URL configured:{' '}
                {statusData.systemInfo.databaseUrlConfigured ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-muted-foreground">
                Strict auth mode: {statusData.systemInfo.strictAuth ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Security & Billing</h4>
              <p className="text-sm text-muted-foreground">
                Stripe API configured: {statusData.systemInfo.stripe.apiConfigured ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-muted-foreground">
                Stripe webhook configured:{' '}
                {statusData.systemInfo.stripe.webhookConfigured ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-muted-foreground">
                Rate-limit backend: {statusData.systemInfo.rateLimit.mode}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loadError ? (
        <p className="text-sm text-destructive mt-4">Latest refresh issue: {loadError}</p>
      ) : null}
    </div>
  )
}
