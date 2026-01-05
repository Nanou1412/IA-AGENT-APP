# IA Agent Platform - Operations Runbooks

This directory contains runbooks for operating the IA Agent platform in production.

## 📚 Runbooks

| Runbook | Description |
|---------|-------------|
| [INCIDENT_HIGH_COSTS.md](./INCIDENT_HIGH_COSTS.md) | Handle unexpectedly high AI/Twilio costs |
| [INCIDENT_ENGINE_ERRORS.md](./INCIDENT_ENGINE_ERRORS.md) | Troubleshoot high engine error rates |
| [INCIDENT_PAYMENT_FAILURES.md](./INCIDENT_PAYMENT_FAILURES.md) | Handle Stripe payment failures |
| [INCIDENT_MESSAGING_FAILURES.md](./INCIDENT_MESSAGING_FAILURES.md) | Handle Twilio SMS/Voice issues |
| [INCIDENT_ABUSE.md](./INCIDENT_ABUSE.md) | Handle abuse detection triggers |
| [KILL_SWITCHES.md](./KILL_SWITCHES.md) | Using kill switches for emergency shutoff |
| [MONITORING.md](./MONITORING.md) | Monitoring and alerting setup |

## 🔥 Quick Reference

### Emergency Kill Switches

Kill switches are per-org and can be activated via:

1. **Admin UI**: `/admin/orgs/[orgId]/settings`
2. **Direct DB update**:
   ```sql
   UPDATE "OrgSettings"
   SET "aiDisabled" = true
   WHERE "orgId" = 'org_xxx';
   ```

### Kill Switch Fields

| Field | Effect |
|-------|--------|
| `aiDisabled` | Blocks AI engine processing |
| `smsDisabled` | Blocks SMS/WhatsApp messaging |
| `voiceDisabled` | Blocks voice calls |
| `bookingDisabled` | Blocks booking creation |
| `takeawayDisabled` | Blocks takeaway orders |
| `paymentDisabled` | Blocks payment processing |

### Global Feature Flags

Set via environment variables (restart required):

| Env Var | Effect |
|---------|--------|
| `FEATURE_AI_ENGINE_ENABLED=false` | Disable AI globally |
| `FEATURE_SMS_ENABLED=false` | Disable SMS globally |
| `FEATURE_STRIPE_ENABLED=false` | Disable Stripe globally |

## 📊 Metrics

Key metrics to monitor:

- `engine.error.count` - Engine failures
- `cost.limit.exceeded` - Budget violations
- `rate.limit.exceeded` - Rate limit hits
- `abuse.detected` - Abuse triggers
- `stripe.order.payments.failed` - Payment failures
- `twilio.sms.outbound` - Message volume

## 🚨 Alerting

Alerts are sent via:

1. **Console logs** (always)
2. **Email** (if `ALERT_EMAIL_TO` is set)
3. **Webhook** (Slack/Discord if `ALERT_WEBHOOK_URL` is set)

Alert severity levels:
- `INFO` - Informational
- `WARNING` - Needs attention
- `ERROR` - Requires action
- `CRITICAL` - Requires immediate action

## 📞 Escalation

1. **P1 (Critical)**: Page on-call immediately
2. **P2 (High)**: Slack #alerts, response within 1h
3. **P3 (Medium)**: Slack #ops, response within 4h
4. **P4 (Low)**: Ticket, response within 24h
