/**
 * Enterprise API System - Advanced Middleware
 * 
 * This module provides advanced API middleware for enterprise applications:
 * - Rate limiting with adaptive algorithms
 * - Circuit breaker patterns for resilience
 * - Comprehensive error handling
 * - Request validation and sanitization
 * - Security enhancements
 * - Monitoring and observability
 * 
 * Features:
 * - Configurable rate limiting per endpoint
 * - Intelligent circuit breaker implementation
 * - Standardized error handling with context
 * - Request/response logging
 * - Performance monitoring
 * - Security headers and protections
 */

// Rate limiting
export { 
  AdvancedRateLimiter, 
  getApiRateLimiter, 
  checkApiRateLimit, 
  resetApiRateLimit, 
  getApiRateLimitStatus,
  type RateLimitConfig,
  type RateLimitResult
} from './rate-limiter';

// Circuit breaker
export { 
  CircuitBreaker, 
  getApiCircuitBreaker, 
  executeWithCircuitBreaker, 
  getCircuitBreakerMetrics, 
  setCircuitBreakerState, 
  shutdownAllCircuitBreakers,
  type CircuitState,
  type CircuitBreakerConfig,
  type CircuitMetrics
} from './circuit-breaker';

// Error handling
export { 
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NetworkError,
  DatabaseError,
  BusinessLogicError,
  ExternalServiceError,
  RateLimitError,
  CircuitBreakerError,
  generateCorrelationId,
  withErrorHandling,
  formatErrorForResponse,
  shouldReportError,
  createErrorResponse,
  type ErrorCategory,
  type ErrorCode
} from './error-handler';