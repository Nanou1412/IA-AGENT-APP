/**
 * Metrics System
 * 
 * Centralized metrics collection for observability.
 * Phase 8: Production Readiness
 * 
 * Design:
 * - Simple, vendor-agnostic interface
 * - Console JSON output (MVP)
 * - Prometheus-compatible interface for future integration
 * - NO PII in labels (orgId OK, phone/email NEVER)
 */

// ============================================================================
// Types
// ============================================================================

export interface MetricLabels {
  orgId?: string;
  channel?: string;
  intent?: string;
  status?: string;
  reason?: string;
  module?: string;
  eventType?: string;
  [key: string]: string | undefined;
}

interface MetricPoint {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

interface MetricsSummary {
  counters: Map<string, number>;
  histograms: Map<string, number[]>;
}

// ============================================================================
// Configuration
// ============================================================================

const METRICS_ENABLED = process.env.METRICS_ENABLED !== 'false';
const METRICS_LOG_LEVEL = process.env.METRICS_LOG_LEVEL || 'info';
const METRICS_BATCH_SIZE = parseInt(process.env.METRICS_BATCH_SIZE || '100', 10);

// In-memory storage for metrics (for Prometheus scraping later)
const metricsBuffer: MetricPoint[] = [];
const counterValues = new Map<string, number>();
const histogramValues = new Map<string, number[]>();

// ============================================================================
// Core Metric Names (Constants)
// ============================================================================

export const METRIC_NAMES = {
  // Engine metrics
  ENGINE_RUN_COUNT: 'engine.run.count',
  ENGINE_RUN_DURATION_MS: 'engine.run.duration_ms',
  ENGINE_TOKENS_INPUT: 'engine.tokens.input',
  ENGINE_TOKENS_OUTPUT: 'engine.tokens.output',
  ENGINE_COST_USD: 'engine.cost.usd',
  ENGINE_ERROR_COUNT: 'engine.error.count',
  
  // Twilio metrics
  TWILIO_SMS_INBOUND: 'twilio.sms.inbound',
  TWILIO_SMS_OUTBOUND: 'twilio.sms.outbound',
  TWILIO_WHATSAPP_INBOUND: 'twilio.whatsapp.inbound',
  TWILIO_WHATSAPP_OUTBOUND: 'twilio.whatsapp.outbound',
  TWILIO_VOICE_STARTED: 'twilio.voice.calls.started',
  TWILIO_VOICE_COMPLETED: 'twilio.voice.calls.completed',
  TWILIO_VOICE_DURATION_SEC: 'twilio.voice.duration_sec',
  TWILIO_COST_USD: 'twilio.cost.usd',
  
  // Stripe metrics
  STRIPE_BILLING_EVENTS: 'stripe.billing.events',
  STRIPE_ORDER_PAYMENTS_PAID: 'stripe.order.payments.paid',
  STRIPE_ORDER_PAYMENTS_FAILED: 'stripe.order.payments.failed',
  STRIPE_FEES_USD: 'stripe.fees.usd',
  
  // Booking metrics
  BOOKING_CREATED: 'booking.created',
  BOOKING_MODIFIED: 'booking.modified',
  BOOKING_CANCELED: 'booking.canceled',
  
  // Takeaway metrics
  TAKEAWAY_ORDERS_CONFIRMED: 'takeaway.orders.confirmed',
  TAKEAWAY_ORDERS_EXPIRED: 'takeaway.orders.expired',
  TAKEAWAY_ORDERS_PAID: 'takeaway.orders.paid',
  
  // Handoff metrics
  HANDOFF_TRIGGERED: 'handoff.triggered',
  
  // Cost control metrics
  COST_LIMIT_EXCEEDED: 'cost.limit.exceeded',
  RATE_LIMIT_EXCEEDED: 'rate.limit.exceeded',
  
  // Abuse detection
  ABUSE_DETECTED: 'abuse.detected',
  ABUSE_MITIGATED: 'abuse.mitigated',
  
  // Alerting
  ALERT_SENT: 'alert.sent',
  
  // Health metrics
  WEBHOOK_FAILURE: 'webhook.failure',
  API_ERROR: 'api.error',
  
  // Feature / Kill switches
  FEATURE_DISABLED: 'feature.disabled',
  KILL_SWITCH_ACTIVATED: 'kill_switch.activated',
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate a unique key for a metric + labels combination
 */
function getMetricKey(name: string, labels?: MetricLabels): string {
  if (!labels || Object.keys(labels).length === 0) {
    return name;
  }
  const sortedLabels = Object.entries(labels)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return `${name}{${sortedLabels}}`;
}

/**
 * Format metric for JSON logging
 */
function formatMetricLog(point: MetricPoint): object {
  return {
    metric: point.name,
    value: point.value,
    labels: point.labels,
    timestamp: new Date(point.timestamp).toISOString(),
  };
}

/**
 * Sanitize labels to ensure no PII
 */
function sanitizeLabels(labels?: MetricLabels): MetricLabels {
  if (!labels) return {};
  
  const sanitized: MetricLabels = {};
  const allowedKeys = ['orgId', 'channel', 'intent', 'status', 'reason', 'module', 'eventType', 'provider', 'type'];
  
  for (const [key, value] of Object.entries(labels)) {
    if (allowedKeys.includes(key) && value !== undefined) {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Increment a counter metric
 * 
 * @example
 * increment('engine.run.count', { orgId: 'org_123', channel: 'sms', status: 'success' });
 */
export function increment(name: string, labels?: MetricLabels, value: number = 1): void {
  if (!METRICS_ENABLED) return;
  
  const sanitizedLabels = sanitizeLabels(labels);
  const key = getMetricKey(name, sanitizedLabels);
  
  const currentValue = counterValues.get(key) || 0;
  counterValues.set(key, currentValue + value);
  
  const point: MetricPoint = {
    name,
    value,
    labels: sanitizedLabels,
    timestamp: Date.now(),
  };
  
  metricsBuffer.push(point);
  
  // Log to console in JSON format
  if (METRICS_LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
    console.log(JSON.stringify({ type: 'metric', ...formatMetricLog(point) }));
  }
  
  // Flush buffer if too large
  if (metricsBuffer.length >= METRICS_BATCH_SIZE) {
    flushMetrics();
  }
}

/**
 * Observe a value (for histograms/gauges)
 * 
 * @example
 * observe('engine.run.duration_ms', 150, { orgId: 'org_123' });
 */
export function observe(name: string, value: number, labels?: MetricLabels): void {
  if (!METRICS_ENABLED) return;
  
  const sanitizedLabels = sanitizeLabels(labels);
  const key = getMetricKey(name, sanitizedLabels);
  
  const values = histogramValues.get(key) || [];
  values.push(value);
  histogramValues.set(key, values);
  
  const point: MetricPoint = {
    name,
    value,
    labels: sanitizedLabels,
    timestamp: Date.now(),
  };
  
  metricsBuffer.push(point);
  
  if (METRICS_LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
    console.log(JSON.stringify({ type: 'metric', ...formatMetricLog(point) }));
  }
  
  if (metricsBuffer.length >= METRICS_BATCH_SIZE) {
    flushMetrics();
  }
}

/**
 * Time an async function and record the duration
 * 
 * @example
 * const result = await time('engine.run.duration_ms', async () => {
 *   return await processEngine(context);
 * }, { orgId: 'org_123' });
 */
export async function time<T>(
  name: string,
  fn: () => Promise<T>,
  labels?: MetricLabels
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    observe(name, duration, { ...labels, status: 'success' });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    observe(name, duration, { ...labels, status: 'error' });
    throw error;
  }
}

/**
 * Time a sync function and record the duration
 */
export function timeSync<T>(
  name: string,
  fn: () => T,
  labels?: MetricLabels
): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    observe(name, duration, { ...labels, status: 'success' });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    observe(name, duration, { ...labels, status: 'error' });
    throw error;
  }
}

// ============================================================================
// Prometheus-compatible Export
// ============================================================================

/**
 * Get all metrics in Prometheus text format
 * For future /metrics endpoint
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = [];
  
  // Export counters
  for (const [key, value] of counterValues) {
    lines.push(`${key} ${value}`);
  }
  
  // Export histogram summaries (simplified - just count and sum)
  for (const [key, values] of histogramValues) {
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = count > 0 ? sum / count : 0;
    
    lines.push(`${key}_count ${count}`);
    lines.push(`${key}_sum ${sum}`);
    lines.push(`${key}_avg ${avg.toFixed(2)}`);
  }
  
  return lines.join('\n');
}

/**
 * Get metrics summary as JSON
 */
export function getMetricsSummary(): MetricsSummary {
  return {
    counters: new Map(counterValues),
    histograms: new Map(histogramValues),
  };
}

/**
 * Flush metrics buffer (for graceful shutdown)
 */
export function flushMetrics(): void {
  if (metricsBuffer.length === 0) return;
  
  // In production, this would send to a metrics aggregator
  // For now, just clear the buffer
  if (process.env.NODE_ENV === 'production' && METRICS_LOG_LEVEL === 'info') {
    console.log(JSON.stringify({
      type: 'metrics_flush',
      count: metricsBuffer.length,
      timestamp: new Date().toISOString(),
    }));
  }
  
  metricsBuffer.length = 0;
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  metricsBuffer.length = 0;
  counterValues.clear();
  histogramValues.clear();
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Record engine run with all relevant labels
 */
export function recordEngineRun(params: {
  orgId: string;
  channel: string;
  intent?: string;
  status: 'success' | 'error' | 'handoff';
  durationMs?: number;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
}): void {
  const labels: MetricLabels = {
    orgId: params.orgId,
    channel: params.channel,
    intent: params.intent,
    status: params.status,
  };
  
  increment(METRIC_NAMES.ENGINE_RUN_COUNT, labels);
  
  if (params.durationMs !== undefined) {
    observe(METRIC_NAMES.ENGINE_RUN_DURATION_MS, params.durationMs, labels);
  }
  
  if (params.tokensInput !== undefined) {
    observe(METRIC_NAMES.ENGINE_TOKENS_INPUT, params.tokensInput, { orgId: params.orgId });
  }
  
  if (params.tokensOutput !== undefined) {
    observe(METRIC_NAMES.ENGINE_TOKENS_OUTPUT, params.tokensOutput, { orgId: params.orgId });
  }
  
  if (params.costUsd !== undefined) {
    observe(METRIC_NAMES.ENGINE_COST_USD, params.costUsd, { orgId: params.orgId });
  }
}

/**
 * Record handoff with reason
 */
export function recordHandoff(orgId: string, reason: string): void {
  increment(METRIC_NAMES.HANDOFF_TRIGGERED, { orgId, reason });
}

/**
 * Record Twilio usage
 */
export function recordTwilioSms(orgId: string, direction: 'inbound' | 'outbound', costUsd?: number): void {
  const metric = direction === 'inbound' 
    ? METRIC_NAMES.TWILIO_SMS_INBOUND 
    : METRIC_NAMES.TWILIO_SMS_OUTBOUND;
  
  increment(metric, { orgId });
  
  if (costUsd !== undefined) {
    observe(METRIC_NAMES.TWILIO_COST_USD, costUsd, { orgId, type: 'sms' });
  }
}

/**
 * Record Twilio voice call
 */
export function recordTwilioVoice(
  orgId: string, 
  event: 'started' | 'completed', 
  durationSec?: number,
  costUsd?: number
): void {
  const metric = event === 'started' 
    ? METRIC_NAMES.TWILIO_VOICE_STARTED 
    : METRIC_NAMES.TWILIO_VOICE_COMPLETED;
  
  increment(metric, { orgId });
  
  if (durationSec !== undefined) {
    observe(METRIC_NAMES.TWILIO_VOICE_DURATION_SEC, durationSec, { orgId });
  }
  
  if (costUsd !== undefined) {
    observe(METRIC_NAMES.TWILIO_COST_USD, costUsd, { orgId, type: 'voice' });
  }
}

/**
 * Record Twilio WhatsApp message
 */
export function recordTwilioWhatsapp(orgId: string, direction: 'inbound' | 'outbound', costUsd?: number): void {
  const metric = direction === 'inbound' 
    ? METRIC_NAMES.TWILIO_WHATSAPP_INBOUND 
    : METRIC_NAMES.TWILIO_WHATSAPP_OUTBOUND;
  
  increment(metric, { orgId });
  
  if (costUsd !== undefined) {
    observe(METRIC_NAMES.TWILIO_COST_USD, costUsd, { orgId, type: 'whatsapp' });
  }
}
