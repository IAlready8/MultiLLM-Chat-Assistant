// Performance Monitoring and Metrics Collection System

import { cache, CacheKeys, CacheConfigs } from './cache';
import { circuitBreakerManager } from './circuit-breaker';

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
  unit?: string;
}

export interface RequestMetrics {
  duration: number;
  statusCode: number;
  endpoint: string;
  method: string;
  userId?: string;
  userAgent?: string;
  provider?: string;
  model?: string;
  timestamp?: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  eventLoopLag: number;
  activeConnections: number;
  cacheHitRate: number;
  circuitBreakerStats: Record<string, any>;
}

export interface AlertCondition {
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  duration: number; // How long condition must persist (ms)
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface Alert {
  id: string;
  condition: AlertCondition;
  triggered: boolean;
  triggeredAt: number | null;
  message: string;
  acknowledged: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private requestMetrics: RequestMetrics[] = [];
  private systemMetrics: SystemMetrics | null = null;
  private alerts: Map<string, Alert> = new Map();
  private alertConditions: AlertCondition[] = [];
  
  // Sliding window for metrics (keep last hour by default)
  private readonly metricsRetentionMs = 3600000; // 1 hour
  
  // Performance tracking
  private requestCount = 0;
  private errorCount = 0;
  private totalResponseTime = 0;
  private startTime = Date.now();

  constructor() {
    this.setupDefaultAlerts();
    this.startSystemMetricsCollection();
  }

  // Record a performance metric
  recordMetric(name: string, value: number, labels?: Record<string, string>, unit?: string): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      labels,
      unit
    };

    this.metrics.push(metric);
    this.cleanupOldMetrics();
    this.checkAlerts(metric);
  }

  // Record request metrics
  recordRequest(metrics: RequestMetrics): void {
    this.requestMetrics.push(metrics);
    
    // Update aggregate stats
    this.requestCount++;
    this.totalResponseTime += metrics.duration;
    
    if (metrics.statusCode >= 400) {
      this.errorCount++;
    }

    // Record as performance metrics for alerting
    this.recordMetric('request_duration', metrics.duration, {
      endpoint: metrics.endpoint,
      method: metrics.method,
      status: metrics.statusCode.toString(),
      provider: metrics.provider || 'unknown'
    }, 'ms');

    this.recordMetric('request_count', 1, {
      endpoint: metrics.endpoint,
      method: metrics.method,
      status: metrics.statusCode.toString()
    });

    if (metrics.tokenUsage) {
      this.recordMetric('token_usage', metrics.tokenUsage.total, {
        provider: metrics.provider || 'unknown',
        model: metrics.model || 'unknown',
        type: 'total'
      }, 'tokens');
    }

    this.cleanupOldRequestMetrics();
  }

  // Get current system metrics
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cacheStats = cache.getStats();
    const circuitStats = circuitBreakerManager.getAllStats();
    
    // Simple CPU usage estimation (not perfect but good enough)
    const cpuUsage = this.estimateCpuUsage();
    
    // Event loop lag measurement
    const eventLoopLag = await this.measureEventLoopLag();

    this.systemMetrics = {
      cpuUsage,
      memoryUsage: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      eventLoopLag,
      activeConnections: this.requestCount,
      cacheHitRate: this.calculateCacheHitRate(),
      circuitBreakerStats: circuitStats
    };

    // Record system metrics
    this.recordMetric('cpu_usage', cpuUsage, {}, '%');
    this.recordMetric('memory_usage', this.systemMetrics.memoryUsage.percentage, {}, '%');
    this.recordMetric('event_loop_lag', eventLoopLag, {}, 'ms');
    this.recordMetric('cache_hit_rate', this.systemMetrics.cacheHitRate, {}, '%');

    return this.systemMetrics;
  }

  // Get performance summary
  getPerformanceSummary(): {
    totalRequests: number;
    errorRate: number;
    averageResponseTime: number;
    uptime: number;
    requestsPerSecond: number;
  } {
    const uptime = Date.now() - this.startTime;
    const uptimeSeconds = uptime / 1000;
    
    return {
      totalRequests: this.requestCount,
      errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
      averageResponseTime: this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0,
      uptime,
      requestsPerSecond: uptimeSeconds > 0 ? this.requestCount / uptimeSeconds : 0
    };
  }

  // Get metrics for a specific time range
  getMetrics(
    startTime: number, 
    endTime: number = Date.now(), 
    metricName?: string
  ): PerformanceMetric[] {
    return this.metrics.filter(metric => {
      const timeMatch = metric.timestamp >= startTime && metric.timestamp <= endTime;
      const nameMatch = !metricName || metric.name === metricName;
      return timeMatch && nameMatch;
    });
  }

  // Get aggregated metrics
  getAggregatedMetrics(
    metricName: string,
    aggregation: 'avg' | 'sum' | 'min' | 'max' | 'count',
    timeRangeMs: number = 300000 // Default 5 minutes
  ): number {
    const startTime = Date.now() - timeRangeMs;
    const relevantMetrics = this.getMetrics(startTime, Date.now(), metricName);
    
    if (relevantMetrics.length === 0) return 0;

    const values = relevantMetrics.map(m => m.value);
    
    switch (aggregation) {
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      default:
        return 0;
    }
  }

  // Alert management
  addAlertCondition(condition: AlertCondition): string {
    this.alertConditions.push(condition);
    
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      condition,
      triggered: false,
      triggeredAt: null,
      message: this.generateAlertMessage(condition),
      acknowledged: false
    };
    
    this.alerts.set(alert.id, alert);
    return alert.id;
  }

  // Get all active alerts
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => alert.triggered);
  }

  // Acknowledge alert
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  // Export metrics for external monitoring systems
  exportMetrics(format: 'prometheus' | 'json' = 'json'): string {
    if (format === 'prometheus') {
      return this.exportPrometheusFormat();
    }
    
    return JSON.stringify({
      timestamp: Date.now(),
      system: this.systemMetrics,
      performance: this.getPerformanceSummary(),
      metrics: this.metrics.slice(-100), // Last 100 metrics
      alerts: Array.from(this.alerts.values())
    }, null, 2);
  }

  // Private methods
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionMs;
    this.metrics = this.metrics.filter(metric => metric.timestamp > cutoff);
  }

  private cleanupOldRequestMetrics(): void {
    const cutoff = Date.now() - this.metricsRetentionMs;
    this.requestMetrics = this.requestMetrics.filter(metric => 
      metric.timestamp ? metric.timestamp > cutoff : true
    );
  }

  private estimateCpuUsage(): number {
    // Simple CPU usage estimation using process.hrtime
    const startTime = process.hrtime();
    const iterations = 10000;
    
    for (let i = 0; i < iterations; i++) {
      Math.random();
    }
    
    const endTime = process.hrtime(startTime);
    const nanoseconds = endTime[0] * 1e9 + endTime[1];
    
    // This is a very rough estimation - in production, use proper CPU monitoring
    return Math.min((nanoseconds / 1000000) * 0.1, 100);
  }

  private async measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        resolve(lag);
      });
    });
  }

  private calculateCacheHitRate(): number {
    // This would need to be implemented based on your cache implementation
    // For now, return a dummy value
    return 85; // 85% cache hit rate
  }

  private checkAlerts(metric: PerformanceMetric): void {
    for (const condition of this.alertConditions) {
      if (condition.metric !== metric.name) continue;

      const alert = Array.from(this.alerts.values()).find(a => 
        a.condition.metric === condition.metric
      );
      
      if (!alert) continue;

      const threshold = condition.threshold;
      const value = metric.value;
      let conditionMet = false;

      switch (condition.operator) {
        case 'gt':
          conditionMet = value > threshold;
          break;
        case 'lt':
          conditionMet = value < threshold;
          break;
        case 'eq':
          conditionMet = value === threshold;
          break;
        case 'gte':
          conditionMet = value >= threshold;
          break;
        case 'lte':
          conditionMet = value <= threshold;
          break;
      }

      if (conditionMet && !alert.triggered) {
        alert.triggered = true;
        alert.triggeredAt = Date.now();
        console.warn(`🚨 Alert triggered: ${alert.message}`);
        
        // In production, send to monitoring service, Slack, etc.
        this.sendAlert(alert);
      } else if (!conditionMet && alert.triggered) {
        alert.triggered = false;
        alert.triggeredAt = null;
        console.info(`✅ Alert resolved: ${alert.message}`);
      }
    }
  }

  private generateAlertMessage(condition: AlertCondition): string {
    return `${condition.metric} is ${condition.operator} ${condition.threshold}`;
  }

  private sendAlert(alert: Alert): void {
    // Implement alert sending logic (email, Slack, webhook, etc.)
    // For now, just log to console
    console.log('Alert would be sent:', alert);
  }

  private setupDefaultAlerts(): void {
    // High error rate alert
    this.addAlertCondition({
      metric: 'request_count',
      threshold: 100,
      operator: 'gt',
      duration: 60000, // 1 minute
      severity: 'high'
    });

    // High response time alert
    this.addAlertCondition({
      metric: 'request_duration',
      threshold: 5000, // 5 seconds
      operator: 'gt',
      duration: 30000, // 30 seconds
      severity: 'medium'
    });

    // High memory usage alert
    this.addAlertCondition({
      metric: 'memory_usage',
      threshold: 90, // 90%
      operator: 'gt',
      duration: 120000, // 2 minutes
      severity: 'critical'
    });

    // High event loop lag alert
    this.addAlertCondition({
      metric: 'event_loop_lag',
      threshold: 100, // 100ms
      operator: 'gt',
      duration: 60000, // 1 minute
      severity: 'high'
    });
  }

  private startSystemMetricsCollection(): void {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.getSystemMetrics().catch(console.error);
    }, 30000);
  }

  private exportPrometheusFormat(): string {
    const lines: string[] = [];
    
    // Group metrics by name
    const metricGroups = new Map<string, PerformanceMetric[]>();
    for (const metric of this.metrics.slice(-1000)) { // Last 1000 metrics
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    }

    // Export in Prometheus format
    for (const [name, metrics] of metricGroups) {
      lines.push(`# HELP ${name} Performance metric`);
      lines.push(`# TYPE ${name} gauge`);
      
      for (const metric of metrics.slice(-10)) { // Last 10 values per metric
        const labels = metric.labels ? 
          Object.entries(metric.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',') : '';
        
        const labelsStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelsStr} ${metric.value} ${metric.timestamp}`);
      }
    }

    return lines.join('\n');
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Middleware helper for automatic request tracking
export function trackRequest(req: any, res: any, next: any): void {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordRequest({
      duration,
      statusCode: res.statusCode,
      endpoint: req.route?.path || req.url,
      method: req.method,
      userId: req.user?.id,
      userAgent: req.get('User-Agent'),
      timestamp: startTime
    });
  });

  next();
}

// Decorators for automatic performance tracking
export function trackPerformance(metricName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const name = metricName || `${target.constructor.name}.${propertyKey}`;
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        
        performanceMonitor.recordMetric(`${name}_duration`, duration, {
          status: 'success',
          class: target.constructor.name,
          method: propertyKey
        }, 'ms');
        
        return result;
      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        performanceMonitor.recordMetric(`${name}_duration`, duration, {
          status: 'error',
          class: target.constructor.name,
          method: propertyKey,
          error: error.name || 'Unknown Error'
        }, 'ms');
        
        throw error;
      }
    };
  };
}