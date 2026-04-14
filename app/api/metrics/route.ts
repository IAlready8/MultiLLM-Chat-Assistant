/**
 * Prometheus-Compatible Metrics Endpoint
 *
 * Provides `/api/metrics` in Prometheus exposition format for integration
 * with Grafana, Datadog, or other observability platforms.
 *
 * @module app/api/metrics/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '@/lib/api-auth';
import { getServerTimestamp } from '@/lib/utils';

// ============================================================================
// Cardinality & Validation Constants
// ============================================================================

/** Maximum number of unique metric series per type (counters, gauges, histograms). */
const MAX_METRICS_PER_TYPE = 100;
/** Maximum number of label key/value pairs on a single metric. */
const MAX_LABELS_PER_METRIC = 10;
/** Maximum length for a metric name. */
const MAX_METRIC_NAME_LENGTH = 128;
/** Maximum length for a label key or value. */
const MAX_LABEL_VALUE_LENGTH = 256;
/** Valid Prometheus metric name pattern: letters/digits/underscores, starting with letter/underscore. */
const METRIC_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
/** Valid Prometheus label key pattern: letters/digits/underscores (no leading digits). */
const LABEL_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateMetricName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= MAX_METRIC_NAME_LENGTH &&
    METRIC_NAME_RE.test(name)
  );
}

function validateLabels(labels: unknown): labels is Record<string, string> | undefined {
  if (labels === undefined || labels === null) return true;
  if (typeof labels !== 'object' || Array.isArray(labels)) return false;
  const entries = Object.entries(labels as Record<string, unknown>);
  if (entries.length > MAX_LABELS_PER_METRIC) return false;
  return entries.every(
    ([k, v]) =>
      LABEL_KEY_RE.test(k) &&
      typeof v === 'string' &&
      v.length <= MAX_LABEL_VALUE_LENGTH
  );
}

// ============================================================================
// Metrics Types & Storage
// ============================================================================

interface CounterMetric { name: string; help: string; value: number; labels?: Record<string, string> }
interface GaugeMetric { name: string; help: string; value: number; labels?: Record<string, string> }
interface HistogramMetric { name: string; help: string; sum: number; count: number; buckets: { le: number; count: number }[]; labels?: Record<string, string> }

const metricsStorage = {
  counters: new Map<string, CounterMetric>(),
  gauges: new Map<string, GaugeMetric>(),
  histograms: new Map<string, HistogramMetric>(),
  requestLatencies: [] as number[],
};

// ============================================================================
// Prometheus Format Helpers
// ============================================================================

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatLabels(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  return `{${Object.entries(labels).map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(', ')}}`;
}

function formatCounter(c: CounterMetric): string {
  return `# HELP ${c.name} ${c.help}\n# TYPE ${c.name} counter\n${c.name}${formatLabels(c.labels)} ${c.value}`;
}

function formatGauge(g: GaugeMetric): string {
  return `# HELP ${g.name} ${g.help}\n# TYPE ${g.name} gauge\n${g.name}${formatLabels(g.labels)} ${g.value}`;
}

function formatHistogram(h: HistogramMetric): string {
  const lines = [`# HELP ${h.name} ${h.help}`, `# TYPE ${h.name} histogram`];
  lines.push(`${h.name}_sum${formatLabels(h.labels)} ${h.sum}`);
  lines.push(`${h.name}_count${formatLabels(h.labels)} ${h.count}`);
  for (const bucket of h.buckets) lines.push(`${h.name}_bucket${formatLabels(h.labels)} ${bucket.count}`);
  return lines.join('\n');
}

// ============================================================================
// Public Metric Functions
// ============================================================================

export function incrementCounter(name: string, labels?: Record<string, string>, value = 1): void {
  const key = JSON.stringify({ name, labels });
  const existing = metricsStorage.counters.get(key);
  if (existing) existing.value += value;
  else metricsStorage.counters.set(key, { name, help: '', value, labels });
}

export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
  const key = JSON.stringify({ name, labels });
  metricsStorage.gauges.set(key, { name, help: '', value, labels });
}

export function observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
  const key = JSON.stringify({ name, labels });
  const existing = metricsStorage.histograms.get(key);
  if (existing) {
    existing.sum += value; existing.count++;
    existing.buckets.push({ le: value, count: 1 });
  } else {
    metricsStorage.histograms.set(key, { name, help: '', sum: value, count: 1, buckets: [{ le: value, count: 1 }], labels });
  }
}

export function recordRequestMetrics(method: string, path: string, statusCode: number, durationMs: number): void {
  const labels = { method, path: normalizePath(path), status: String(statusCode) };
  incrementCounter('multillm_http_requests_total', labels);
  observeHistogram('multillm_http_request_duration_seconds', durationMs / 1000, labels);
  if (statusCode >= 500) incrementCounter('multillm_http_errors_total', labels);
}

function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

// ============================================================================
// GET /api/metrics - Prometheus exposition format
// ============================================================================

export async function GET(): Promise<NextResponse> {
  const output: string[] = [];
  output.push('# MultiLLM Chat Assistant Metrics');
  output.push(`# Exported at: ${getServerTimestamp()}`);
  output.push('');
  output.push(`# Built-in application metrics`);
  output.push(`multillm_info{version="${process.env.npm_package_version || 'unknown'}"} 1`);
  output.push('multillm_up 1');
  output.push('');

  output.push('# Counter metrics');
  for (const counter of metricsStorage.counters.values()) output.push(formatCounter(counter));
  output.push('');

  output.push('# Gauge metrics');
  for (const gauge of metricsStorage.gauges.values()) output.push(formatGauge(gauge));
  output.push('');

  output.push('# Histogram metrics');
  for (const histogram of metricsStorage.histograms.values()) output.push(formatHistogram(histogram));
  output.push('');

  if (metricsStorage.requestLatencies.length > 0) {
    const latencies = [...metricsStorage.requestLatencies].sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);
    const avg = sum / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    output.push('# Request latency summary');
    output.push(`multillm_http_request_latency_avg_seconds ${avg / 1000}`);
    output.push(`multillm_http_request_latency_p50_seconds ${p50 / 1000}`);
    output.push(`multillm_http_request_latency_p95_seconds ${p95 / 1000}`);
    output.push(`multillm_http_request_latency_p99_seconds ${p99 / 1000}`);
    output.push('');
  }

  return new NextResponse(output.join('\n'), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}

// ============================================================================
// POST /api/metrics - Internal metrics collection (admin only)
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authCheck = await getAuthenticatedAdmin();
  if (authCheck instanceof NextResponse) return authCheck;

  try {
    const body = await request.json();

    if (!validateMetricName(body.name)) {
      return NextResponse.json(
        { error: 'Invalid metric name: must match [a-zA-Z_][a-zA-Z0-9_]* and be ≤128 chars' },
        { status: 400 }
      );
    }

    if (!validateLabels(body.labels)) {
      return NextResponse.json(
        { error: `Invalid labels: must be an object with ≤${MAX_LABELS_PER_METRIC} string entries (keys matching [a-zA-Z_][a-zA-Z0-9_]*, values ≤${MAX_LABEL_VALUE_LENGTH} chars)` },
        { status: 400 }
      );
    }

    if (body.type === 'counter') {
      if (metricsStorage.counters.size >= MAX_METRICS_PER_TYPE) {
        return NextResponse.json({ error: 'Counter cardinality limit reached' }, { status: 429 });
      }
      incrementCounter(body.name, body.labels, body.value);
    } else if (body.type === 'gauge') {
      if (metricsStorage.gauges.size >= MAX_METRICS_PER_TYPE) {
        return NextResponse.json({ error: 'Gauge cardinality limit reached' }, { status: 429 });
      }
      setGauge(body.name, body.value, body.labels);
    } else if (body.type === 'histogram') {
      if (metricsStorage.histograms.size >= MAX_METRICS_PER_TYPE) {
        return NextResponse.json({ error: 'Histogram cardinality limit reached' }, { status: 429 });
      }
      observeHistogram(body.name, body.value, body.labels);
    } else {
      return NextResponse.json({ error: 'Invalid metric type' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// ============================================================================
// Exports
// ============================================================================

export function getMetricsSnapshot() {
  return {
    counters: Object.fromEntries(Array.from(metricsStorage.counters.entries()).map(([k, v]) => [k, v.value])),
    gauges: Object.fromEntries(Array.from(metricsStorage.gauges.entries()).map(([k, v]) => [k, v.value])),
    histograms: Object.fromEntries(metricsStorage.histograms.entries()),
  };
}

export function resetMetrics(): void {
  metricsStorage.counters.clear();
  metricsStorage.gauges.clear();
  metricsStorage.histograms.clear();
  metricsStorage.requestLatencies = [];
}
