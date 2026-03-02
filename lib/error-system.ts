import { logger } from '@/lib/logger'
import { v4 as uuidv4 } from 'uuid'

type AnalyticsRow = { payload?: string | null }
type AnalyticsDelegate = {
  create: (args: unknown) => Promise<unknown>
  findMany: (args: unknown) => Promise<AnalyticsRow[]>
}
type PrismaLike = { analytics: AnalyticsDelegate }

let prismaClientPromise: Promise<PrismaLike | null> | null = null

async function getPrismaClient(): Promise<PrismaLike | null> {
  if (typeof window !== 'undefined') {
    return null
  }

  if (!prismaClientPromise) {
    prismaClientPromise = import('@/lib/prisma')
      .then((mod) => (mod.default ?? (mod as unknown as { prisma: PrismaLike }).prisma) as PrismaLike)
      .catch((error) => {
        console.warn('Prisma client unavailable in error-system:', error)
        return null
      })
  }

  return prismaClientPromise
}

// Error categories for better classification
export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network',
  LLM_PROVIDER = 'provider',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  RATE_LIMIT = 'rate_limit',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// Error severity levels for prioritization
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error context for better diagnostics
export interface ErrorContext {
  endpoint: string
  userId?: string
  timestamp: Date
  metadata: Record<string, any>
  requestId?: string
}

// Base application error class
export class BaseAppError extends Error {
  public id: string
  constructor(
    public code: string,
    public category: ErrorCategory,
    public severity: ErrorSeverity,
    message: string,
    public userMessage: string,
    public context: ErrorContext,
    public isRetryable: boolean = false,
    public maxRetries: number = 3,
    public retryCount: number = 0
  ) {
    super(message)
    this.name = 'BaseAppError'
    this.id = uuidv4()
  }
}

// Specific error types
export class ValidationError extends BaseAppError {
  constructor(
    message: string,
    field: string,
    context: ErrorContext
  ) {
    super(
      'VAL_001',
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      message,
      `Invalid ${field}. Please check your input.`,
      { ...context, metadata: { ...context.metadata, field } }
    )
  }
}

export class NetworkError extends BaseAppError {
  constructor(
    message: string,
    context: ErrorContext,
    originalError?: Error
  ) {
    super(
      'NET_001',
      ErrorCategory.NETWORK,
      ErrorSeverity.HIGH,
      `${message}${originalError ? `: ${originalError.message}` : ''}`,
      'Network error occurred. Please check your connection and try again.',
      context,
      true // retryable
    )
  }
}

export class LLMProviderError extends BaseAppError {
  constructor(
    provider: string,
    message: string,
    context: ErrorContext,
    originalError?: Error
  ) {
    super(
      'LLM_001',
      ErrorCategory.LLM_PROVIDER,
      ErrorSeverity.MEDIUM,
      `${message}${originalError ? `: ${originalError.message}` : ''}`,
      `Error with ${provider} provider. Please try again or switch providers.`,
      { ...context, metadata: { ...context.metadata, provider } },
      true // retryable
    )
  }
}

export class DatabaseError extends BaseAppError {
  constructor(
    message: string,
    context: ErrorContext,
    originalError?: Error
  ) {
    super(
      'DATABASE_ERROR',
      ErrorCategory.DATABASE,
      ErrorSeverity.CRITICAL,
      `${message}${originalError ? `: ${originalError.message}` : ''}`,
      'Database error occurred. Please try again later.',
      context,
      true // retryable
    )
  }
}

export class AuthenticationError extends BaseAppError {
  constructor(
    message: string,
    context: ErrorContext
  ) {
    super(
      'AUTH_001',
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.HIGH,
      message,
      'Authentication failed. Please check your credentials.',
      context
    )
  }
}

export class NotImplementedError extends BaseAppError {
  constructor(
    featureName: string,
    context?: Partial<ErrorContext>
  ) {
    const defaultContext: ErrorContext = {
      endpoint: 'unknown',
      timestamp: new Date(),
      metadata: {},
      ...context,
    }
    super(
      'NOT_IMPL_001',
      ErrorCategory.SYSTEM,
      ErrorSeverity.LOW,
      `Feature '${featureName}' is not implemented`,
      `This feature is not yet available.`,
      { ...defaultContext, metadata: { ...defaultContext.metadata, featureName } }
    )
  }
}

export class RateLimitError extends BaseAppError {
  constructor(message: string, retryAfter: number, context: ErrorContext)
  constructor(retryAfter: number, context: ErrorContext)
  constructor(a: string | number, b: number | ErrorContext, c?: ErrorContext) {
    const hasMessage = typeof a === 'string'
    const message = hasMessage ? (a as string) : 'Rate limit exceeded'
    const retryAfter = (hasMessage ? (b as number) : (a as number))
    const context = (hasMessage ? (c as ErrorContext) : (b as ErrorContext))
    super(
      'RATE_001',
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      message,
      `Rate limit exceeded. Please wait ${Math.ceil(retryAfter / 1000)} seconds before trying again.`,
      {
        ...context,
        metadata: {
          ...context.metadata,
          retryAfter,
        },
      },
      true,
      1,
      0
    )
  }
}

// Type for AppError (union of all specific error types)
export type AppError = 
  | BaseAppError
  | ValidationError
  | NetworkError
  | LLMProviderError
  | DatabaseError
  | AuthenticationError
  | RateLimitError

// Recovery action types
export type RecoveryAction = 
  | { type: 'retry'; payload?: Record<string, any> }
  | { type: 'switch_provider'; payload?: Record<string, any> }
  | { type: 'refresh_token'; payload?: Record<string, any> }
  | { type: 'fallback'; payload?: Record<string, any> }

export interface RecoveryResult {
  success: boolean
  action?: RecoveryAction
  message: string
}

// Error statistics interface
export interface ErrorStats {
  total: number
  byCategory: Record<ErrorCategory, number>
  bySeverity: Record<ErrorSeverity, number>
  topErrors: Array<{ code: string; count: number }>
}

// Error manager for centralized error handling
export class ErrorManager {
  private static instance: ErrorManager
  private constructor() {}

  public static getInstance(): ErrorManager {
    if (!ErrorManager.instance) {
      ErrorManager.instance = new ErrorManager()
    }
    return ErrorManager.instance
  }

  async logError(error: Error, context?: Partial<ErrorContext>): Promise<void> {
    try {
      const appError = this.normalizeError(error, context)
      // Structured log via app logger
      try {
        logger.error('app_error', {
          id: appError.id,
          code: appError.code,
          category: appError.category,
          severity: appError.severity,
          message: appError.message,
          userMessage: appError.userMessage,
          context: appError.context,
          stack: appError.stack,
          retryCount: appError.retryCount,
          isRetryable: appError.isRetryable,
        })
      } catch (logErr) {
        console.error('Failed to log error:', logErr)
        console.error('Original error:', error)
      }

      // Persist critical errors for analytics/inspection
      if (appError.severity === ErrorSeverity.CRITICAL) {
        try {
          const prisma = await getPrismaClient()
          if (prisma) {
            await prisma.analytics.create({
              data: {
                id: uuidv4(),
                event: 'error',
                payload: JSON.stringify({
                  code: appError.code,
                  category: appError.category,
                  severity: appError.severity,
                  message: appError.message,
                }),
                // Analytics.userId is required in schema; default to 'system' if absent
                userId: appError.context.userId ?? 'system',
              },
            })
          }
        } catch (persistErr) {
          // swallow persistence errors in logger
        }
      }

    } catch (loggingError) {
      // Fallback logging to console if structured logging fails
      console.error('Failed to log error:', loggingError)
      console.error('Original error:', error)
    }
  }

  private normalizeError(error: Error, context?: Partial<ErrorContext>): AppError {
    if (error instanceof BaseAppError) {
      return error
    }

    // Convert regular errors to AppError
    const defaultContext: ErrorContext = {
      endpoint: 'unknown',
      timestamp: new Date(),
      metadata: {},
      ...context,
    }

    return new BaseAppError(
      'UNKNOWN_001',
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      error.message,
      'An unexpected error occurred. Please try again.',
      defaultContext,
      false,
      0
    )
  }

  private async reportToMonitoring(error: AppError): Promise<void> {
    // Implement integration with your monitoring service (e.g., Sentry, DataDog)
    // This is a placeholder implementation
    console.log('Reporting to monitoring service:', {
      error: error.message,
      code: error.code,
      category: error.category,
      severity: error.severity,
    })
  }

  createUserFriendlyMessage(error: AppError): string {
    return error.userMessage
  }

  async attemptRecovery(error: AppError): Promise<RecoveryResult> {
    if (!error.isRetryable || error.retryCount >= error.maxRetries) {
      return {
        success: false,
        message: 'Error cannot be recovered automatically.',
      }
    }

    try {
      const recoveryAction = this.determineRecoveryAction(error)
      
      if (recoveryAction) {
        error.retryCount++
        return {
          success: true,
          action: recoveryAction,
          message: `Attempting recovery: ${recoveryAction.type}`,
        }
      }

      return {
        success: false,
        message: 'No recovery action available.',
      }
    } catch (recoveryError) {
      return {
        success: false,
        message: 'Recovery attempt failed.',
      }
    }
  }

  private determineRecoveryAction(error: AppError): RecoveryAction | null {
    switch (error.category) {
      case ErrorCategory.NETWORK:
        return { type: 'retry' }
      
      case ErrorCategory.RATE_LIMIT:
        const retryAfter = error.context.metadata?.retryAfter || 5000
        return { type: 'retry', payload: { delay: retryAfter } }
      
      case ErrorCategory.LLM_PROVIDER:
        return { type: 'switch_provider' }
      
      case ErrorCategory.AUTHENTICATION:
        return { type: 'refresh_token' }
      
      case ErrorCategory.DATABASE:
        return { type: 'retry' }
      
      default:
        return null
    }
  }

  async getErrorStats(options: { from: Date; to: Date }): Promise<ErrorStats> {
    try {
      const rows = await prisma.analytics.findMany({
        where: {
          event: 'error',
          createdAt: { gte: options.from, lte: options.to },
        },
      })

      const byCategory = {} as Record<ErrorCategory, number>
      const bySeverity = {} as Record<ErrorSeverity, number>
      const counts = new Map<string, number>()
      let total = 0

      for (const row of rows) {
        try {
          const payload = JSON.parse(row.payload || '{}')
          const code = payload.code as string | undefined
          const category = payload.category as ErrorCategory | undefined
          const severity = payload.severity as ErrorSeverity | undefined
          if (!code || !category || !severity) continue
          total++
          byCategory[category] = (byCategory[category] || 0) + 1
          bySeverity[severity] = (bySeverity[severity] || 0) + 1
          counts.set(code, (counts.get(code) || 0) + 1)
        } catch {
          // skip invalid rows
        }
      }

      const topErrors = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ code, count }))

      return {
        total,
        byCategory,
        bySeverity,
        topErrors,
      }
    } catch {
      const zeroByCategory = Object.values(ErrorCategory).reduce((acc, key) => {
        acc[key as ErrorCategory] = 0
        return acc
      }, {} as Record<ErrorCategory, number>)
      const zeroBySeverity = Object.values(ErrorSeverity).reduce((acc, key) => {
        acc[key as ErrorSeverity] = 0
        return acc
      }, {} as Record<ErrorSeverity, number>)
      return { total: 0, byCategory: zeroByCategory, bySeverity: zeroBySeverity, topErrors: [] }
    }
  }
}

export function createErrorContext(
  endpoint: string,
  userId?: string,
  metadata: Record<string, any> = {}
): ErrorContext {
  return {
    endpoint,
    userId,
    timestamp: new Date(),
    metadata,
    requestId: uuidv4(),
  }
}

// Export singleton
export const errorManager = ErrorManager.getInstance()

// Type guard utility
export function isAppError(err: unknown): err is AppError {
  return err instanceof BaseAppError
}