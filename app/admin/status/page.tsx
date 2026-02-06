'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  XCircle,
  Clock,
  Server,
  Database,
  Shield
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type SystemCheck = {
  id: string
  name: string
  description: string
  status: 'ok' | 'warning' | 'error'
  icon: LucideIcon
  message: string
}

const SYSTEM_CHECKS: SystemCheck[] = [
  {
    id: 'api',
    name: 'API Server',
    description: 'Check API server connectivity and response time',
    status: 'ok',
    icon: Server,
    message: 'API server responding normally'
  },
  {
    id: 'database',
    name: 'Database',
    description: 'Verify database connectivity and performance',
    status: 'ok',
    icon: Database,
    message: 'Database connection established'
  },
  {
    id: 'auth',
    name: 'Authentication',
    description: 'Validate user authentication and session management',
    status: 'ok',
    icon: Shield,
    message: 'Auth system operational'
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'Verify persistent storage functionality',
    status: 'ok',
    icon: Database,
    message: 'Storage system operational'
  },
  {
    id: 'rate-limit',
    name: 'Rate Limiting',
    description: 'Check rate limiting functionality',
    status: 'ok',
    icon: Clock,
    message: 'Rate limiting active and functional'
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Validate API key encryption and security measures',
    status: 'ok',
    icon: Shield,
    message: 'Security protocols active'
  }
]

const renderStatusIcon = (status: string, className: string) => {
  const Icon =
    status === 'ok'
      ? CheckCircle
      : status === 'error'
        ? XCircle
        : Clock

  return <Icon className={className} />
}

export default function SystemStatusPage() {
  const checks = SYSTEM_CHECKS

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-green-500'
      case 'warning': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const overallStatus = checks.some(check => check.status === 'error') 
    ? 'error' 
    : checks.some(check => check.status === 'warning') 
      ? 'warning' 
      : checks.length > 0 
        ? 'ok' 
        : 'unknown'

  const statusColor = getStatusColor(overallStatus)

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="mb-6">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            {renderStatusIcon(
              overallStatus,
              `h-12 w-12 ${overallStatus === 'ok' ? 'text-green-500' : overallStatus === 'error' ? 'text-red-500' : 'text-yellow-500'}`
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="text-2xl">System Status</CardTitle>
            <Badge variant="secondary">Simulated</Badge>
          </div>
          <CardDescription>
            Current operational status of all system components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-medium">Overall System Health</span>
            <Badge 
              variant={overallStatus === 'ok' ? 'default' : overallStatus === 'error' ? 'destructive' : 'secondary'}
              className="capitalize"
            >
              {overallStatus}
            </Badge>
          </div>
          
          <div className="space-y-4">
            {checks.map((check) => {
              const checkStatusColor = getStatusColor(check.status)
              
              return (
                <div key={check.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                  <div className={`p-2 rounded-full ${checkStatusColor} bg-opacity-20`}>
                    {renderStatusIcon(
                      check.status,
                      `h-5 w-5 ${checkStatusColor.replace('bg', 'text')}`
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{check.name}</h3>
                      <Badge 
                        variant={check.status === 'ok' ? 'default' : check.status === 'error' ? 'destructive' : 'secondary'}
                        className="capitalize"
                      >
                        {check.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{check.description}</p>
                    <p className="text-sm mt-2 flex items-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${checkStatusColor}`}></span>
                      {check.message}
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
              <p className="text-sm text-muted-foreground">Multi-LLM Chat Assistant</p>
              <p className="text-sm text-muted-foreground">Version: 1.0.0</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Environment</h4>
              <p className="text-sm text-muted-foreground">Node.js {process.version}</p>
              <p className="text-sm text-muted-foreground">Next.js 14.2.33</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Database</h4>
              <p className="text-sm text-muted-foreground">PostgreSQL</p>
              <p className="text-sm text-muted-foreground">Prisma ORM</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Authentication</h4>
              <p className="text-sm text-muted-foreground">NextAuth.js</p>
              <p className="text-sm text-muted-foreground">JWT Session Management</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
