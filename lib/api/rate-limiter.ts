/**
 * Rate Limiter Implementation
 * 
 * This module provides rate limiting functionality for API requests.
 * It implements a token bucket algorithm to control the rate of requests.
 */

// Type definitions
export type RateLimitConfig = {
  requests: number;
  window: number; // in milliseconds
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
};

// In-memory storage for rate limiting (in a real application, you'd use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

class AdvancedRateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const key = identifier;
    const stored = rateLimitStore.get(key);
    
    // Calculate reset time for this window
    const windowStart = stored ? stored.resetTime : now;
    const resetTime = windowStart + this.config.window;
    
    // If the window has passed, reset the counter
    if (now >= resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now
      });
      return {
        allowed: true,
        remaining: this.config.requests - 1,
        resetTime: now + this.config.window
      };
    }
    
    // Get current count or initialize to 0
    const currentCount = stored ? stored.count : 0;
    
    // Check if limit exceeded
    if (currentCount >= this.config.requests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: resetTime - now
      };
    }
    
    // Increment and store the count
    rateLimitStore.set(key, {
      count: currentCount + 1,
      resetTime
    });
    
    return {
      allowed: true,
      remaining: this.config.requests - currentCount - 1,
      resetTime
    };
  }

  async reset(identifier: string): Promise<void> {
    rateLimitStore.delete(identifier);
  }
}

// Default instance of the rate limiter
let defaultRateLimiter: AdvancedRateLimiter | null = null;

/**
 * Get the default API rate limiter instance
 */
export const getApiRateLimiter = (config?: RateLimitConfig): AdvancedRateLimiter => {
  if (!defaultRateLimiter) {
    // Use default config if none provided
    const defaultConfig: RateLimitConfig = config || { requests: 60, window: 60000 }; // 60 requests per minute
    defaultRateLimiter = new AdvancedRateLimiter(defaultConfig);
  }
  return defaultRateLimiter;
};

/**
 * Check if an API request is within rate limits
 */
export const checkApiRateLimit = async (identifier: string, config?: RateLimitConfig): Promise<RateLimitResult> => {
  const limiter = getApiRateLimiter(config);
  return await limiter.check(identifier);
};

/**
 * Reset rate limit for a specific identifier
 */
export const resetApiRateLimit = async (identifier: string): Promise<void> => {
  const limiter = getApiRateLimiter();
  return await limiter.reset(identifier);
};

/**
 * Get current rate limit status for an identifier
 */
export const getApiRateLimitStatus = (identifier: string): RateLimitResult | null => {
  const stored = rateLimitStore.get(identifier);
  if (!stored) {
    return null;
  }
  
  const now = Date.now();
  const config = defaultRateLimiter?.['config'] || { requests: 60, window: 60000 };
  const resetTime = stored.resetTime + config.window;
  
  if (now >= resetTime) {
    // Window has passed, effectively no limit applied
    return {
      allowed: true,
      remaining: config.requests,
      resetTime: now + config.window
    };
  }
  
  return {
    allowed: stored.count < config.requests,
    remaining: Math.max(0, config.requests - stored.count),
    resetTime
  };
};

// Export the AdvancedRateLimiter class as well
export { AdvancedRateLimiter };