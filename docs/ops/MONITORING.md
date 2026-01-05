# Monitoring Guide

## Overview

This guide covers the monitoring and alerting setup for the IA Agent platform.

## Metrics

### Metrics System

The platform uses a simple, vendor-agnostic metrics system (`src/lib/metrics.ts`).

**Key functions:**
- `increment(name, labels)` - Increment a counter
- `observe(name, value, labels)` - Record a value (histogram/gauge)
- `time(name, fn, labels)` - Measure function duration

### Core Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `engine.run.count` | counter | Engine runs by status |
| `engine.run.duration_ms` | histogram | Engine run duration |
| `engine.tokens.input` | counter | Input tokens used |
| `engine.tokens.output` | counter | Output tokens used |
| `engine.cost.usd` | counter | AI cost in USD |
| `engine.error.count` | counter | Engine errors |
| `twilio.sms.inbound` | counter | Inbound SMS |
| `twilio.sms.outbound` | counter | Outbound SMS |
| `twilio.cost.usd` | counter | Twilio cost in USD |
| `stripe.order.payments.paid` | counter | Successful payments |
| `stripe.order.payments.failed` | counter | Failed payments |
| `booking.created` | counter | Bookings created |
| `takeaway.orders.confirmed` | counter | Orders confirmed |
| `handoff.triggered` | counter | Handoffs triggered |
| `cost.limit.exceeded` | counter | Budget exceeded |
| `rate.limit.exceeded` | counter | Rate limit hit |
| `abuse.detected` | counter | Abuse detected |
| `alert.sent` | counter | Alerts sent |

### Using Metrics

```typescript
import { increment, observe, time, METRIC_NAMES } from '@/lib/metrics';

// Count an event
increment(METRIC_NAMES.ENGINE_RUN_COUNT, { orgId, status: 'success' });

// Record a value
observe(METRIC_NAMES.ENGINE_RUN_DURATION_MS, 1234, { orgId });

// Time a function
const result = await time(METRIC_NAMES.ENGINE_RUN_DURATION_MS, 
  async () => runEngine(input),
  { orgId }
);
```

### Exporting Metrics

Currently, metrics are:
1. Logged to console as JSON (for log aggregation)
2. Stored in memory (for `/api/metrics` endpoint, if implemented)

Future: Prometheus `/metrics` endpoint for scraping.

## Cost Tracking

### MonthlyOrgCost Table

Tracks costs per org per month:

```sql
SELECT 
  "orgId",
  "month",
  "aiCostUsd",
  "twilioCostUsd",
  "stripeFeesUsd",
  "totalEngineRuns",
  "totalTokensInput",
  "totalTokensOutput",
  "totalSmsSent"
FROM "MonthlyOrgCost"
WHERE "month" = TO_CHAR(NOW(), 'YYYY-MM')
ORDER BY "aiCostUsd" DESC;
```

### Budget Checking

```typescript
import { checkBudget, getMonthlyUsage } from '@/lib/cost-tracker';

// Check if org can continue using AI
const result = await checkBudget('org_xxx', 'ai');
if (!result.allowed) {
  console.log(`Budget exceeded: $${result.currentUsd} / $${result.budgetUsd}`);
}

// Get current usage
const usage = await getMonthlyUsage('org_xxx');
console.log(`AI: $${usage.aiCostUsd}, Twilio: $${usage.twilioCostUsd}`);
```

## Alerting

### Alert Configuration

Set via environment variables:

```bash
# Console (always enabled)
# No config needed

# Email
ALERT_EMAIL_TO=ops@example.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxx

# Webhook (Slack/Discord)
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx
ALERT_WEBHOOK_TYPE=slack  # or 'discord', 'generic'

# Deduplication window
ALERT_DEDUP_WINDOW_MS=300000  # 5 minutes
```

### Alert Severity Levels

| Level | When | Action |
|-------|------|--------|
| `INFO` | FYI events | Log only |
| `WARNING` | Needs attention | Notify team |
| `ERROR` | Requires action | Escalate |
| `CRITICAL` | Immediate | Page on-call |

### Sending Alerts

```typescript
import { sendAlert, AlertSeverity } from '@/lib/alerts';

await sendAlert({
  severity: AlertSeverity.ERROR,
  title: 'High Error Rate',
  message: 'Engine error rate exceeded 5%',
  context: { orgId, errorRate: 0.08 },
  dedupKey: 'engine_errors_org_xxx',
});
```

### Pre-built Alert Helpers

```typescript
import { 
  alertStripePaymentFailure,
  alertTwilioDeliveryFailure,
  alertHighEngineErrorRate,
  alertBudgetExceeded,
  alertCriticalError,
} from '@/lib/alerts';

await alertBudgetExceeded('org_xxx', 'ai', 55.0, 50.0);
```

## Log Aggregation

### Structured Logging

Use correlation IDs for request tracing:

```typescript
import { withRequestContext, logWithContext } from '@/lib/correlation';

await withRequestContext({ orgId: 'org_xxx' }, async () => {
  logWithContext('info', 'Processing request', { action: 'create_booking' });
  // ... do work
  logWithContext('info', 'Request completed', { durationMs: 123 });
});
```

### Log Format

Logs are JSON-formatted for easy parsing:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Processing request",
  "correlationId": "uuid-xxx",
  "orgId": "org_xxx",
  "durationMs": 123
}
```

## Health Checks

### Database Health

```sql
-- Quick health check
SELECT 1;

-- Connection count
SELECT count(*) FROM pg_stat_activity;

-- Slow queries
SELECT 
  query,
  calls,
  mean_time,
  total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### API Health

Consider implementing:
- `/api/health` - Basic health check
- `/api/health/db` - Database connectivity
- `/api/health/redis` - Redis connectivity (if used)
- `/api/metrics` - Prometheus metrics

## Dashboards

### Key Queries for Dashboards

**Engine Performance:**
```sql
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  COUNT(*) as runs,
  AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000) as avg_duration_ms,
  COUNT(*) FILTER (WHERE "status" = 'error') as errors
FROM "EngineRun"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

**Cost by Org (Top 10):**
```sql
SELECT 
  "orgId",
  "aiCostUsd" + "twilioCostUsd" as total_cost
FROM "MonthlyOrgCost"
WHERE "month" = TO_CHAR(NOW(), 'YYYY-MM')
ORDER BY total_cost DESC
LIMIT 10;
```

**Message Volume:**
```sql
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  "direction",
  "channel",
  COUNT(*) as count
FROM "MessageLog"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour, "direction", "channel"
ORDER BY hour;
```

## Recommended Tools

### Log Aggregation
- Vercel Logs (if on Vercel)
- Datadog
- Papertrail
- Logtail

### Metrics/Monitoring
- Prometheus + Grafana
- Datadog
- New Relic

### Alerting
- PagerDuty
- Opsgenie
- Slack (via webhooks)

### Error Tracking
- Sentry
- Bugsnag
- Rollbar
