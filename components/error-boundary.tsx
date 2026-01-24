'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { errorManager, type AppError, createErrorContext } from '@/lib/error-system'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showErrorDetails?: boolean
  level?: 'page' | 'component' | 'feature'
}

interface State {
  hasError: boolean
  error: Error | null
  errorId: string | null
  isRecovering: boolean
  recoveryAttempts: number
}

export class ErrorBoundary extends Component<Props, State> {
  private maxRecoveryAttempts = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      isRecovering: false,
      recoveryAttempts: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const context = createErrorContext(
      `error-boundary-${this.props.level || 'component'}`,
      undefined,
      {
        componentStack: errorInfo.componentStack,
        errorBoundary: this.props.level || 'component',
        recoveryAttempts: this.state.recoveryAttempts,
      }
    )

    try {
      await errorManager.logError(error, context)
      
      // Removed isAppError check since it's not exported
    } catch (loggingError) {
      console.error('Failed to log error in boundary:', loggingError)
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)

    // Attempt automatic recovery for recoverable errors
    // Removed isAppError check since it's not exported
    if (error && this.state.recoveryAttempts < this.maxRecoveryAttempts) {
      this.attemptRecovery(error as AppError)
    }
  }

  private async attemptRecovery(error: AppError) {
    this.setState({ isRecovering: true })

    try {
      const recoveryResult = await errorManager.attemptRecovery(error)
      
      if (recoveryResult.success && recoveryResult.action) {
        switch (recoveryResult.action.type) {
          case 'retry':
            await this.handleRetryRecovery(recoveryResult.action.payload?.delay || 1000)
            break
          case 'refresh_token':
            await this.handleTokenRefresh()
            break
          case 'fallback':
            await this.handleFallbackRecovery()
            break
          default:
            this.setState({ isRecovering: false })
        }
      } else {
        this.setState({ isRecovering: false })
      }
    } catch (recoveryError) {
      console.error('Recovery attempt failed:', recoveryError)
      this.setState({ isRecovering: false })
    }
  }

  private async handleRetryRecovery(delay: number = 1000) {
    await new Promise(resolve => setTimeout(resolve, delay))
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorId: null,
      isRecovering: false,
      recoveryAttempts: prevState.recoveryAttempts + 1,
    }))
  }

  private async handleTokenRefresh() {
    try {
      // Trigger token refresh (implement based on your auth system)
      window.location.reload()
    } catch (refreshError) {
      this.setState({ isRecovering: false })
    }
  }

  private async handleFallbackRecovery() {
    // Implement fallback recovery based on context
    this.setState({ isRecovering: false })
  }

  private handleManualRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorId: null,
      isRecovering: false,
      recoveryAttempts: prevState.recoveryAttempts + 1,
    }))
  }

  private handleReportError = async () => {
    if (this.state.error && this.state.errorId) {
      try {
        // Create error report
        const report = {
          errorId: this.state.errorId,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          userDescription: '', // Could be collected via a form
        }

        // Send report to your error reporting service
        console.log('Error report:', report)
        
        // Show success message
        alert('Error report sent successfully. Thank you for helping us improve!')
      } catch (reportError) {
        console.error('Failed to send error report:', reportError)
        alert('Failed to send error report. Please try again later.')
      }
    }
  }

  private navigateHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      // Show custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Show loading state during recovery
      if (this.state.isRecovering) {
        return (
          <Card className="w-full max-w-md mx-auto mt-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-center space-x-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Attempting to recover...</span>
              </div>
            </CardContent>
          </Card>
        )
      }

      const error = this.state.error
      const isAppError = error && 'userMessage' in error
      const userMessage = isAppError ? (error as any).userMessage : 'An unexpected error occurred.'

      return (
        <Card className="w-full max-w-2xl mx-auto mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Something went wrong</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{userMessage}</AlertDescription>
            </Alert>

            {this.props.showErrorDetails && error && (
              <details className="text-sm text-gray-600">
                <summary className="cursor-pointer font-medium">Technical Details</summary>
                <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
                {this.state.errorId && (
                  <p className="mt-2 text-xs text-gray-500">
                    Error ID: {this.state.errorId}
                  </p>
                )}
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={this.handleManualRetry} variant="default" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              
              {this.props.level === 'page' && (
                <Button onClick={this.navigateHome} variant="outline" size="sm">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              )}
              
              <Button onClick={this.handleReportError} variant="outline" size="sm">
                <Bug className="h-4 w-4 mr-2" />
                Report Error
              </Button>
            </div>

            {this.state.recoveryAttempts > 0 && (
              <p className="text-sm text-gray-500">
                Recovery attempts: {this.state.recoveryAttempts}/{this.maxRecoveryAttempts}
              </p>
            )}
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

// Specialized error boundaries for different contexts
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary 
      level="page" 
      showErrorDetails={process.env.NODE_ENV === 'development'}
    >
      {children}
    </ErrorBoundary>
  )
}

export function ComponentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary 
      level="component"
      fallback={
        <Alert className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This component encountered an error. Please refresh the page.
          </AlertDescription>
        </Alert>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

export function FeatureErrorBoundary({ 
  children, 
  featureName 
}: { 
  children: ReactNode
  featureName: string 
}) {
  return (
    <ErrorBoundary 
      level="feature"
      onError={(error, errorInfo) => {
        console.error(`Error in feature: ${featureName}`, error, errorInfo)
      }}
      fallback={
        <Card className="w-full">
          <CardContent className="p-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The {featureName} feature is temporarily unavailable. 
                Please try refreshing the page or contact support if the problem persists.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// Hook for handling errors in functional components
export function useErrorHandler() {
  const handleError = async (error: Error, context?: Partial<any>) => {
    const errorContext = createErrorContext(
      context?.endpoint || 'unknown',
      context?.userId,
      context?.metadata || {}
    )

    await errorManager.logError(error, errorContext)
  }

  return { handleError }
}