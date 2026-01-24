/**
 * Enterprise API System - Advanced Error Handling
 * 
 * This module provides comprehensive error handling for API operations:
 * - Standardized error types and codes
 * - Error categorization and classification
 * - Contextual error information
 * - Error transformation and enrichment
 * - Graceful degradation strategies
 * - Detailed error logging
 * 
 * Features:
 * - Custom error classes for different error types
 * - Error code standardization
 * - Context preservation
 * - Stack trace enhancement
 * - Error correlation tracking
 * - Operational vs. programmer error distinction
 */

import { logger } from '@/lib/logger';

// Error categories
export type ErrorCategory = 
  'VALIDATION' | 
  'AUTHENTICATION' | 
  'AUTHORIZATION' | 
  'NETWORK' | 
  'DATABASE' | 
  'BUSINESS_LOGIC' | 
  'EXTERNAL_SERVICE' | 
  'RATE_LIMIT' | 
  'CIRCUIT_BREAKER' | 
  'UNKNOWN';

// Standardized error codes
export type ErrorCode = 
  // Validation errors
  'VALIDATION_FAILED' |
  'INVALID_INPUT' |
  'MISSING_REQUIRED_FIELD' |
  
  // Authentication errors
  'UNAUTHORIZED' |
  'INVALID_CREDENTIALS' |
  'SESSION_EXPIRED' |
  'TOKEN_EXPIRED' |
  
  // Authorization errors
  'FORBIDDEN' |
  'INSUFFICIENT_PERMISSIONS' |
  'ACCESS_DENIED' |
  
  // Network errors
  'NETWORK_ERROR' |
  'TIMEOUT' |
  'CONNECTION_FAILED' |
  
  // Database errors
  'DATABASE_ERROR' |
  'CONFLICT' |
  'NOT_FOUND' |
  'DUPLICATE_ENTRY' |
  
  // Business logic errors
  'BUSINESS_RULE_VIOLATION' |
  'INVALID_OPERATION' |
  'STATE_MISMATCH' |
  
  // External service errors
  'EXTERNAL_SERVICE_ERROR' |
  'EXTERNAL_SERVICE_TIMEOUT' |
  'EXTERNAL_SERVICE_UNAVAILABLE' |
  
  // Rate limiting errors
  'RATE_LIMIT_EXCEEDED' |
  'QUOTA_EXCEEDED' |
  
  // Circuit breaker errors
  'CIRCUIT_BREAKER_OPEN' |
  'SERVICE_UNAVAILABLE' |
  
  // Unknown errors
  'UNKNOWN_ERROR' |
  'INTERNAL_ERROR';

// Base error class
export class ApiError extends Error {
  public readonly category: ErrorCategory;
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly correlationId?: string;
  public readonly timestamp: Date;
  public readonly isOperational: boolean;
  
  constructor(
    message: string,
    category: ErrorCategory,
    code: ErrorCode,
    statusCode: number,
    options?: {
      details?: Record<string, any>;
      correlationId?: string;
      cause?: Error;
      isOperational?: boolean;
    }
  ) {
    // Pass remaining arguments (including vendor specific ones) to parent constructor
    super(message, { cause: options?.cause });
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
    
    this.name = this.constructor.name;
    this.category = category;
    this.code = code;
    this.statusCode = statusCode;
    this.details = options?.details;
    this.correlationId = options?.correlationId;
    this.timestamp = new Date();
    this.isOperational = options?.isOperational ?? true;
  }
  
  /**
   * Convert error to plain object for JSON serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      correlationId: this.correlationId,
      timestamp: this.timestamp.toISOString(),
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
  
  /**
   * Log error with contextual information
   */
  log(context?: Record<string, any>): void {
    const logData = {
      error: this.toJSON(),
      context,
      correlationId: this.correlationId
    };
    
    // Log with appropriate level based on error severity
    if (this.statusCode >= 500) {
      logger.error('API Error', logData);
    } else if (this.statusCode >= 400) {
      logger.warn('API Warning', logData);
    } else {
      logger.info('API Info', logData);
    }
  }
}

// Validation errors
export class ValidationError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'VALIDATION_FAILED',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'VALIDATION', code, 400, { details, correlationId });
  }
}

// Authentication errors
export class AuthenticationError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'UNAUTHORIZED',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'AUTHENTICATION', code, 401, { details, correlationId });
  }
}

// Authorization errors
export class AuthorizationError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'FORBIDDEN',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'AUTHORIZATION', code, 403, { details, correlationId });
  }
}

// Network errors
export class NetworkError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'NETWORK_ERROR',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'NETWORK', code, 503, { details, correlationId });
  }
}

// Database errors
export class DatabaseError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'DATABASE_ERROR',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'DATABASE', code, 500, { details, correlationId });
  }
}

// Business logic errors
export class BusinessLogicError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'BUSINESS_RULE_VIOLATION',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'BUSINESS_LOGIC', code, 400, { details, correlationId });
  }
}

// External service errors
export class ExternalServiceError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'EXTERNAL_SERVICE_ERROR',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'EXTERNAL_SERVICE', code, 503, { details, correlationId });
  }
}

// Rate limiting errors
export class RateLimitError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'RATE_LIMIT_EXCEEDED',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'RATE_LIMIT', code, 429, { details, correlationId });
  }
}

// Circuit breaker errors
export class CircuitBreakerError extends ApiError {
  constructor(
    message: string,
    code: ErrorCode = 'CIRCUIT_BREAKER_OPEN',
    details?: Record<string, any>,
    correlationId?: string
  ) {
    super(message, 'CIRCUIT_BREAKER', code, 503, { details, correlationId });
  }
}

// Utility functions for error handling

/**
 * Generate a correlation ID for error tracking
 */
export function generateCorrelationId(): string {
  return 'err_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Wrap an async function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // If it's already an ApiError, log it and rethrow
    if (error instanceof ApiError) {
      error.log(context);
      throw error;
    }
    
    // Otherwise, create a new ApiError
    const correlationId = generateCorrelationId();
    const apiError = new ApiError(
      error.message || 'Internal server error',
      'UNKNOWN',
      'INTERNAL_ERROR',
      500,
      {
        details: { originalError: error.message },
        correlationId,
        cause: error
      }
    );
    
    apiError.log(context);
    throw apiError;
  }
}

/**
 * Transform an error to API response format
 */
export function formatErrorForResponse(error: Error): Record<string, any> {
  if (error instanceof ApiError) {
    return error.toJSON();
  }
  
  // For non-ApiError instances, create a generic error response
  return {
    name: error.name,
    message: error.message,
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  };
}

/**
 * Determine if an error should be reported to monitoring systems
 */
export function shouldReportError(error: ApiError): boolean {
  // Don't report operational errors (e.g., validation errors)
  if (!error.isOperational) {
    return true;
  }
  
  // Report server errors (5xx)
  if (error.statusCode >= 500) {
    return true;
  }
  
  // Report specific critical errors
  const criticalCodes: ErrorCode[] = [
    'DATABASE_ERROR',
    'EXTERNAL_SERVICE_ERROR',
    'CIRCUIT_BREAKER_OPEN',
    'INTERNAL_ERROR'
  ];
  
  return criticalCodes.includes(error.code);
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: ApiError | Error,
  includeDetails = process.env.NODE_ENV === 'development'
): { error: Record<string, any> } {
  const formattedError = formatErrorForResponse(error);
  
  // Remove stack trace in production
  if (process.env.NODE_ENV !== 'development') {
    delete formattedError.stack;
  }
  
  // Remove internal details in production unless explicitly requested
  if (!includeDetails && process.env.NODE_ENV !== 'development') {
    delete formattedError.details;
  }
  
  return { error: formattedError };
}