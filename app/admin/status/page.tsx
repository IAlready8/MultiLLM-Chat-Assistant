'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Server, 
  Database, 
  Zap,
  Shield
} from 'lucide-react'

export default function SystemStatusPage() {
  const [status, setStatus] = useState({
    api: 'unknown',
    database: 'unknown',
    cache: 'unknown',
    auth: 'unknown',
    storage: 'unknown'
  })
  
  const [checks, setChecks] = useState<any[]>([])
  const [overallProgress, setOverallProgress] = useState(0)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    runSystemChecks()
  }, [])

  const runSystemChecks = async () => {
    setIsChecking(true)
    setOverallProgress(0)
    
    const newChecks = []
    let completedChecks = 0
    const totalChecks = 6

    // Check 1: API connectivity
    newChecks.push({
      id: 'api',
      name: 'API Server',
      description: 'Check API server connectivity and response time',
      status: 'ok',
      icon: Server,
      message: 'API server responding normally'
    })
    completedChecks++
    setOverallProgress(Math.round((completedChecks / totalChecks) * 100))
    
    // Check 2: Database connection
    newChecks.push({
      id: 'database',
      name: 'Database',
      description: 'Verify database connectivity and performance',
      status: 'ok',
      icon: Database,
      message: 'Database connection established'
    })
    completedChecks++
    setOverallProgress(Math.round((completedChecks / totalChecks) * 100))
    
    // Check 3: Authentication system
    newChecks.push({
      id: 'auth',
      name: 'Authentication',
      description: 'Validate user authentication and session management',
      status: 'ok',
      icon: Shield,
      message: 'Auth system operational'
    })
    completedChecks++
    setOverallProgress(Math.round((completedChecks / totalChecks) * 100))
    
    // Check 4: Storage system
    newChecks.push({
      id: 'storage',
      name: 'Storage',
      description: 'Verify persistent storage functionality',
      status: 'ok',
      icon: Database,
      message: 'Storage system operational'
    })
    completedChecks++
    setOverallProgress(Math.round((completedChecks / totalChecks) * 100))
    
    // Check 5: Rate limiting
    newChecks.push({
      id: 'rate-limit',
      name: 'Rate Limiting',
      description: 'Check rate limiting functionality',
      status: 'ok',
      icon: Clock,
      message: 'Rate limiting active and functional'
    })
    completedChecks++
    setOverallProgress(Math.round((completedChecks / totalChecks) * 100))
    
    // Check 6: Security
    newChecks.push({
      id: 'security',
      name: 'Security',
      description: 'Validate API key encryption and security measures',
      status: 'ok',
      icon: Shield,
      message: 'Security protocols active'
    })
    completedChecks++
    setOverallProgress(100)
    
    setChecks(newChecks)
    setIsChecking(false)
    
    // Update overall status based on checks
    const hasError = newChecks.some(check => check.status === 'error')
    const hasWarning = newChecks.some(check => check.status === 'warning')
    
    if (hasError) {
      setStatus(prev => ({ ...prev, overall: 'error' }))
    } else if (hasWarning) {
      setStatus(prev => ({ ...prev, overall: 'warning' }))
    } else {
      setStatus(prev => ({ ...prev, overall: 'ok' }))
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok': return 'bg-green-500'
      case 'warning': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok': return CheckCircle
      case 'error': return XCircle
      case 'warning': return Clock
      default: return Clock
    }
  }

  const overallStatus = checks.some(check => check.status === 'error') 
    ? 'error' 
    : checks.some(check => check.status === 'warning') 
      ? 'warning' 
      : checks.length > 0 
        ? 'ok' 
        : 'unknown'

  const StatusIcon = getStatusIcon(overallStatus)
  const statusColor = getStatusColor(overallStatus)

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="mb-6">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <StatusIcon className={`h-12 w-12 ${overallStatus === 'ok' ? 'text-green-500' : overallStatus === 'error' ? 'text-red-500' : 'text-yellow-500'}`} />
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
          
          {isChecking ? (
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Running system checks...</span>
                <span>{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} />
            </div>
          ) : (
            <div className="space-y-4">
              {checks.map((check) => {
                const IconComponent = check.icon
                const CheckStatusIcon = getStatusIcon(check.status)
                const checkStatusColor = getStatusColor(check.status)
                
                return (
                  <div key={check.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                    <div className={`p-2 rounded-full ${checkStatusColor} bg-opacity-20`}>
                      <CheckStatusIcon className={`h-5 w-5 ${checkStatusColor.replace('bg', 'text')}`} />
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
          )}
          
          <div className="mt-6 flex justify-center">
            <Button onClick={runSystemChecks} disabled={isChecking}>
              <Zap className="h-4 w-4 mr-2" />
              {isChecking ? 'Checking...' : 'Run Health Check'}
            </Button>
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
