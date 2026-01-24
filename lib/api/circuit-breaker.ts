/**
 * Circuit Breaker Implementation
 * 
 * This module provides circuit breaker functionality for API resilience.
 * It implements the circuit breaker pattern to handle failures gracefully.
 */

// Type definitions
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type CircuitBreakerConfig = {
  failureThreshold: number; // number of failures before opening circuit
  timeout: number; // milliseconds to wait before attempting to close circuit
  resetTimeout: number; // milliseconds to wait before trying a request when OPEN
};

export type CircuitMetrics = {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
};

// Enum for circuit breaker events
enum CircuitBreakerEvent {
  STATE_CHANGED = 'state_changed',
  FAILURE = 'failure',
  SUCCESS = 'success'
}

// In-memory storage for circuit breaker state
const circuitBreakerStore = new Map<string, {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  openedAt: number | null;
}>();

class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      timeout: config?.timeout ?? 60000, // 1 minute
      resetTimeout: config?.resetTimeout ?? 30000, // 30 seconds
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    
    if (state === 'OPEN') {
      // Check if it's time to attempt to close the circuit
      const openedAt = circuitBreakerStore.get(this.name)?.openedAt || 0;
      if (Date.now() - openedAt >= this.config.resetTimeout) {
        // Try to transition to HALF_OPEN state for one test request
        circuitBreakerStore.set(this.name, {
          ...this.getCurrentState(),
          state: 'HALF_OPEN'
        });
      } else {
        throw new Error(`Circuit breaker '${this.name}' is OPEN`);
      }
    }
    
    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async onSuccess(): Promise<void> {
    const current = this.getCurrentState();
    
    if (current.state === 'HALF_OPEN') {
      // Success in HALF_OPEN state means we can close the circuit
      circuitBreakerStore.set(this.name, {
        ...current,
        state: 'CLOSED',
        failureCount: 0,
        openedAt: null
      });
    } else {
      // Update metrics for success
      circuitBreakerStore.set(this.name, {
        ...current,
        totalRequests: current.totalRequests + 1,
        totalSuccesses: current.totalSuccesses + 1
      });
    }
  }

  private async onFailure(): Promise<void> {
    const current = this.getCurrentState();
    
    const updatedFailureCount = current.failureCount + 1;
    const newState: CircuitState = 
      updatedFailureCount >= this.config.failureThreshold ? 'OPEN' : 'CLOSED';
    
    circuitBreakerStore.set(this.name, {
      ...current,
      state: newState,
      failureCount: updatedFailureCount,
      lastFailureTime: Date.now(),
      totalRequests: current.totalRequests + 1,
      totalFailures: current.totalFailures + 1,
      openedAt: newState === 'OPEN' ? Date.now() : null
    });
  }

  /**
   * Get the current state of the circuit breaker
   */
  getState(): CircuitState {
    const current = this.getCurrentState();
    
    // Check if we should transition from OPEN to HALF_OPEN after timeout
    if (current.state === 'OPEN' && 
        current.openedAt && 
        Date.now() - current.openedAt >= this.config.timeout) {
      circuitBreakerStore.set(this.name, {
        ...current,
        state: 'HALF_OPEN'
      });
      return 'HALF_OPEN';
    }
    
    return current.state;
  }

  private getCurrentState(): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number | null;
    totalRequests: number;
    totalSuccesses: number;
    totalFailures: number;
    openedAt: number | null;
  } {
    if (!circuitBreakerStore.has(this.name)) {
      return {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: null,
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        openedAt: null
      };
    }
    return circuitBreakerStore.get(this.name)!;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitMetrics {
    const current = this.getCurrentState();
    return {
      state: current.state,
      failureCount: current.failureCount,
      lastFailureTime: current.lastFailureTime,
      totalRequests: current.totalRequests,
      totalSuccesses: current.totalSuccesses,
      totalFailures: current.totalFailures
    };
  }

  /**
   * Manually set the circuit breaker state
   */
  setState(state: CircuitState): void {
    const current = this.getCurrentState();
    circuitBreakerStore.set(this.name, {
      ...current,
      state,
      openedAt: state === 'OPEN' ? Date.now() : null
    });
  }

  /**
   * Reset the circuit breaker to CLOSED state
   */
  reset(): void {
    circuitBreakerStore.set(this.name, {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: null,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      openedAt: null
    });
  }
}

// Registry for all circuit breakers
const circuitBreakerRegistry = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker instance
 */
export const getApiCircuitBreaker = (name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker => {
  if (!circuitBreakerRegistry.has(name)) {
    const breaker = new CircuitBreaker(name, config);
    circuitBreakerRegistry.set(name, breaker);
  }
  return circuitBreakerRegistry.get(name)!;
};

/**
 * Execute a function with circuit breaker protection
 */
export const executeWithCircuitBreaker = async <T>(
  name: string, 
  fn: () => Promise<T>,
  config?: Partial<CircuitBreakerConfig>
): Promise<T> => {
  const breaker = getApiCircuitBreaker(name, config);
  return await breaker.execute(fn);
};

/**
 * Get circuit breaker metrics
 */
export const getCircuitBreakerMetrics = (name: string): CircuitMetrics | null => {
  if (!circuitBreakerRegistry.has(name)) {
    return null;
  }
  const breaker = circuitBreakerRegistry.get(name)!;
  return breaker.getMetrics();
};

/**
 * Set circuit breaker state
 */
export const setCircuitBreakerState = (name: string, state: CircuitState): void => {
  if (!circuitBreakerRegistry.has(name)) {
    getApiCircuitBreaker(name); // Create if not exists
  }
  const breaker = circuitBreakerRegistry.get(name)!;
  breaker.setState(state);
};

/**
 * Shutdown all circuit breakers
 */
export const shutdownAllCircuitBreakers = (): void => {
  circuitBreakerRegistry.clear();
};

// Export the CircuitBreaker class as well
export { CircuitBreaker };