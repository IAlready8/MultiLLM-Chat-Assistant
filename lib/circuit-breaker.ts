// Circuit Breaker Implementation for LLM Provider Resilience

export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failing, rejecting requests
  HALF_OPEN = 'half-open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  // Failure threshold to open the circuit
  failureThreshold: number;
  
  // Success threshold to close the circuit in half-open state
  successThreshold: number;
  
  // Time to wait before attempting to half-open (milliseconds)
  timeout: number;
  
  // Reset timeout for failure count (milliseconds)
  resetTimeout: number;
  
  // Monitor window for tracking failures (milliseconds)
  monitoringWindow: number;
  
  // Expected error rate threshold (0-1)
  expectedFailureRate: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  uptime: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private failures: number[] = []; // Timestamp array for sliding window
  private readonly startTime = Date.now();

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerError(
          `Circuit breaker ${this.name} is OPEN. Next attempt allowed at ${new Date(this.nextAttemptTime).toISOString()}`
        );
      }
      
      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    // Add operation timeout to prevent hanging requests
    const timeoutMs = 30000; // 30 seconds default timeout
    
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      )
    ]);
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.successCount++;
    
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.reset();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.failureCount++;
    
    // Add to sliding window
    this.failures.push(Date.now());
    this.cleanupFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeout;
    } else if (this.state === CircuitState.CLOSED) {
      const currentFailureRate = this.getCurrentFailureRate();
      
      if (this.failureCount >= this.config.failureThreshold || 
          currentFailureRate > this.config.expectedFailureRate) {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.config.timeout;
      }
    }
  }

  private cleanupFailures(): void {
    const now = Date.now();
    const windowStart = now - this.config.monitoringWindow;
    this.failures = this.failures.filter(timestamp => timestamp > windowStart);
  }

  private getCurrentFailureRate(): number {
    this.cleanupFailures();
    const recentRequests = Math.max(1, this.failures.length);
    return this.failures.length / recentRequests;
  }

  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
  }

  // Public API for monitoring
  getStats(): CircuitBreakerStats {
    this.cleanupFailures();
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      uptime: Date.now() - this.startTime
    };
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  // Manual controls for testing/admin purposes
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeout;
  }

  forceClosed(): void {
    this.state = CircuitState.CLOSED;
    this.reset();
  }

  forceHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// Circuit Breaker Manager for multiple providers
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  
  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,      // Open after 5 failures
    successThreshold: 3,      // Close after 3 successes
    timeout: 60000,          // Wait 1 minute before retry
    resetTimeout: 300000,    // Reset failure count after 5 minutes
    monitoringWindow: 600000, // Monitor failures over 10 minutes
    expectedFailureRate: 0.5  // 50% failure rate threshold
  };

  getOrCreateBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const finalConfig = { ...this.defaultConfig, ...config };
      this.breakers.set(name, new CircuitBreaker(name, finalConfig));
    }
    return this.breakers.get(name)!;
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  getHealthySystems(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([_, breaker]) => breaker.isClosed())
      .map(([name, _]) => name);
  }

  getUnhealthySystems(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([_, breaker]) => breaker.isOpen())
      .map(([name, _]) => name);
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClosed();
    }
  }

  resetBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.forceClosed();
    }
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();

// Provider-specific configurations
export const ProviderConfigs = {
  openai: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,        // 30 seconds for OpenAI
    resetTimeout: 180000,  // 3 minutes
    monitoringWindow: 300000, // 5 minutes
    expectedFailureRate: 0.3
  },
  
  anthropic: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 45000,        // 45 seconds for Anthropic
    resetTimeout: 240000,  // 4 minutes
    monitoringWindow: 300000,
    expectedFailureRate: 0.2
  },
  
  google: {
    failureThreshold: 4,
    successThreshold: 2,
    timeout: 60000,        // 60 seconds for Google AI
    resetTimeout: 300000,  // 5 minutes
    monitoringWindow: 600000, // 10 minutes
    expectedFailureRate: 0.4
  },
  
  groq: {
    failureThreshold: 8,   // Groq is usually fast, allow more attempts
    successThreshold: 3,
    timeout: 20000,        // 20 seconds
    resetTimeout: 120000,  // 2 minutes
    monitoringWindow: 180000, // 3 minutes
    expectedFailureRate: 0.6
  },
  
  ollama: {
    failureThreshold: 2,   // Local Ollama should be more reliable
    successThreshold: 1,
    timeout: 120000,       // 2 minutes for local processing
    resetTimeout: 60000,   // 1 minute
    monitoringWindow: 300000,
    expectedFailureRate: 0.1
  }
} as const;

// Helper function to execute with circuit breaker protection
export async function executeWithCircuitBreaker<T>(
  providerName: string,
  operation: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> {
  const breaker = circuitBreakerManager.getOrCreateBreaker(
    providerName,
    config || ProviderConfigs[providerName as keyof typeof ProviderConfigs]
  );
  
  return breaker.execute(operation);
}