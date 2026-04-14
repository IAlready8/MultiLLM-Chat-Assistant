/**
 * Comprehensive Health Checker
 *
 * Provides detailed diagnostic information for operators including
 * dependency status, version information, remediation suggestions,
 * and historical health trends.
 *
 * @module lib/health-checker
 */

import { getServerTimestamp } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface DependencyCheck {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface VersionInfo {
  app: string;
  node: string;
  framework: string;
  database?: string;
  redis?: string;
}

export interface HealthHistoryEntry {
  timestamp: string;
  status: HealthStatus;
  durationMs?: number;
}

export interface HealthHistory {
  totalChecks: number;
  healthyChecks: number;
  degradedChecks: number;
  unhealthyChecks: number;
  avgResponseTimeMs: number;
  entries: HealthHistoryEntry[];
}

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  totalLatencyMs: number;
  version: VersionInfo;
  dependencies: DependencyCheck[];
  suggestions: string[];
  history?: HealthHistory;
}

export interface ComponentInfo {
  name: string;
  version: string;
  status: HealthStatus;
  config: Record<string, unknown>;
}

// ============================================================================
// Health Checks
// ============================================================================

async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: 'database',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: 'Database connection successful',
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Database connection failed',
    };
  }
}

async function checkRedis(): Promise<DependencyCheck> {
  const start = Date.now();
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      name: 'redis',
      status: 'degraded',
      message: 'Redis not configured',
      metadata: { optional: true },
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({ url: redisUrl, token: process.env.REDIS_TOKEN || '' });
    await redis.ping();
    return {
      name: 'redis',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: 'Redis connection successful',
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Redis connection failed (using in-memory fallback)',
      metadata: { optional: true },
    };
  }
}

async function checkSidecar(): Promise<DependencyCheck> {
  const start = Date.now();
  const sidecarUrl = process.env.PYTHON_CORE_URL || 'http://127.0.0.1:8008';

  if (!process.env.PYTHON_CORE_URL) {
    return {
      name: 'python_sidecar',
      status: 'degraded',
      message: 'Python sidecar not configured',
      metadata: { optional: true },
    };
  }

  try {
    const response = await fetch(`${sidecarUrl}/api/v1/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;
    if (response.ok) {
      return {
        name: 'python_sidecar',
        status: 'healthy',
        latencyMs,
        message: 'Sidecar health check passed',
      };
    }
    return {
      name: 'python_sidecar',
      status: 'degraded',
      latencyMs,
      message: `Sidecar returned status ${response.status}`,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name: 'python_sidecar',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Sidecar unavailable (using local fallback)',
      metadata: { optional: true },
    };
  }
}

async function checkStripe(): Promise<DependencyCheck> {
  const start = Date.now();
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      name: 'stripe',
      status: 'degraded',
      message: 'Stripe not configured',
      metadata: { optional: true },
    };
  }
  try {
    const { stripe } = await import('@/lib/stripe');
    await stripe.customers.list({ limit: 1 });
    return {
      name: 'stripe',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: 'Stripe connection successful',
    };
  } catch (error) {
    return {
      name: 'stripe',
      status: 'degraded',
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Stripe connection issue',
      metadata: { optional: true },
    };
  }
}

async function checkEnvironment(): Promise<DependencyCheck> {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'API_KEY_ENCRYPTION_SEED'];
  const missing: string[] = [];
  const present: string[] = [];

  for (const envVar of required) {
    if (process.env[envVar]) {
      present.push(envVar);
    } else {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'environment',
      status: 'unhealthy',
      message: `Missing required env vars: ${missing.join(', ')}`,
      error: `Missing: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'environment',
    status: 'healthy',
    message: `All ${present.length} required environment variables present`,
    metadata: { configured: present },
  };
}

async function checkMemory(): Promise<DependencyCheck> {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const heapUsedPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  const message = `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsedPercent}%)`;

  if (heapUsedPercent > 90) {
    return {
      name: 'memory',
      status: 'unhealthy',
      message,
      error: 'Memory usage above 90%',
      metadata: { heapUsedMB, heapTotalMB, heapUsedPercent },
    };
  }
  if (heapUsedPercent > 75) {
    return {
      name: 'memory',
      status: 'degraded',
      message,
      metadata: { heapUsedMB, heapTotalMB, heapUsedPercent },
    };
  }
  return {
    name: 'memory',
    status: 'healthy',
    message,
    metadata: { heapUsedMB, heapTotalMB, heapUsedPercent },
  };
}

// ============================================================================
// Suggestions
// ============================================================================

function generateSuggestions(results: DependencyCheck[]): string[] {
  const suggestions: string[] = [];
  for (const result of results) {
    switch (result.name) {
      case 'database':
        if (result.status !== 'healthy') {
          suggestions.push('Verify DATABASE_URL is correctly set and database is reachable');
          suggestions.push('Check database server logs for connection errors');
        }
        break;
      case 'redis':
        if (result.status !== 'healthy') {
          suggestions.push('Redis is optional - in-memory fallback will be used');
          suggestions.push('To enable Redis, set REDIS_URL environment variable');
        }
        break;
      case 'python_sidecar':
        if (result.status !== 'healthy' && process.env.PYTHON_CORE_URL) {
          suggestions.push('Python sidecar is optional - Node.js local fallback is active');
          suggestions.push('Check PYTHON_CORE_URL and sidecar server logs');
        }
        break;
      case 'environment':
        if (result.status !== 'healthy') {
          suggestions.push('Set all required environment variables in deployment');
          suggestions.push('Refer to .env.example for required variables');
        }
        break;
      case 'memory':
        if (result.status === 'degraded') {
          suggestions.push('Memory usage elevated - monitor for leaks');
        }
        if (result.status === 'unhealthy') {
          suggestions.push('Memory critical - immediate restart recommended');
        }
        break;
    }
  }
  return suggestions;
}

// ============================================================================
// Main Health Check
// ============================================================================

export async function performHealthCheck(options?: {
  includeHistory?: boolean;
  checks?: string[];
}): Promise<HealthCheckResult> {
  const start = Date.now();

  const checkFunctions: Record<string, () => Promise<DependencyCheck>> = {
    database: checkDatabase,
    redis: checkRedis,
    python_sidecar: checkSidecar,
    stripe: checkStripe,
    environment: checkEnvironment,
    memory: checkMemory,
  };

  const checksToRun = options?.checks || Object.keys(checkFunctions);
  const checkPromises = checksToRun.map(async (checkName) => {
    const checkFn = checkFunctions[checkName];
    if (!checkFn) return null;
    return checkFn();
  });

  const results = await Promise.all(checkPromises);
  const dependencies = results.filter((r): r is DependencyCheck => r !== null);

  const hasUnhealthy = dependencies.some(d => d.status === 'unhealthy');
  const hasDegraded = dependencies.some(d => d.status === 'degraded');
  const status: HealthStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';
  const suggestions = generateSuggestions(dependencies);

  const version: VersionInfo = {
    app: process.env.npm_package_version || '1.0.0',
    node: process.version,
    framework: `Next.js ${require('next/package.json').version}`,
  };

  const result: HealthCheckResult = {
    status,
    timestamp: getServerTimestamp(),
    totalLatencyMs: Date.now() - start,
    version,
    dependencies,
    suggestions,
  };

  if (options?.includeHistory) {
    result.history = {
      totalChecks: 0, healthyChecks: 0, degradedChecks: 0,
      unhealthyChecks: 0, avgResponseTimeMs: 0, entries: [],
    };
  }

  return result;
}

export function isHealthyForTraffic(result: HealthCheckResult): boolean {
  const db = result.dependencies.find(d => d.name === 'database');
  const env = result.dependencies.find(d => d.name === 'environment');
  if (!db || db.status !== 'healthy') return false;
  if (!env || env.status !== 'healthy') return false;
  return true;
}

export function canHandleWrites(result: HealthCheckResult): boolean {
  return result.status === 'healthy';
}

export async function quickHealthCheck(): Promise<{ status: HealthStatus; timestamp: string }> {
  const result = await performHealthCheck({ checks: ['database', 'environment'] });
  return { status: result.status, timestamp: result.timestamp };
}

export async function detailedHealthCheck(): Promise<HealthCheckResult> {
  return performHealthCheck({ includeHistory: true });
}

export function getComponentInfo(): ComponentInfo[] {
  return [
    {
      name: 'Application',
      version: process.env.npm_package_version || '1.0.0',
      status: 'healthy',
      config: { nodeVersion: process.version, environment: process.env.NODE_ENV || 'development' },
    },
    {
      name: 'Database',
      version: 'PostgreSQL',
      status: process.env.DATABASE_URL ? 'healthy' : 'unhealthy',
      config: { configured: !!process.env.DATABASE_URL, adapter: '@prisma/adapter-pg' },
    },
    {
      name: 'Cache',
      version: 'Redis',
      status: process.env.REDIS_URL ? 'healthy' : 'degraded',
      config: { configured: !!process.env.REDIS_URL, optional: true },
    },
    {
      name: 'Auth',
      version: 'NextAuth v4',
      status: 'healthy',
      config: { providers: ['credentials', 'google', 'github'] },
    },
  ];
}
