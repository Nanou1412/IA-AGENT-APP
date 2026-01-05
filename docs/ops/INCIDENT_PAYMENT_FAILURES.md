# Incident: Payment Failures

## Symptoms

- Alert: "Stripe Payment Failed"
- `stripe.order.payments.failed` metric increasing
- Users reporting payment not working
- OrderPaymentLink with status `failed`

## Severity

**P2** - High priority, affects revenue

## Investigation Steps

### 1. Check recent payment failures

```sql
SELECT 
  "id",
  "orderId",
  "status",
  "stripeCheckoutSessionId",
  "expiresAt",
  "createdAt"
FROM "OrderPaymentLink"
WHERE "status" = 'failed'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC
LIMIT 50;
```

### 2. Check failure patterns

```sql
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  "status",
  COUNT(*) as count
FROM "OrderPaymentLink"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour, "status"
ORDER BY hour DESC;
```

### 3. Check by org

```sql
SELECT 
  o."orgId",
  org."name",
  COUNT(*) FILTER (WHERE o."status" = 'paid') as paid,
  COUNT(*) FILTER (WHERE o."status" = 'failed') as failed,
  COUNT(*) FILTER (WHERE o."status" = 'expired') as expired
FROM "Order" o
JOIN "Org" org ON o."orgId" = org."id"
WHERE o."createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY o."orgId", org."name"
ORDER BY failed DESC;
```

### 4. Check Stripe Dashboard

1. Go to https://dashboard.stripe.com/
2. Check "Developers" > "Events" for failures
3. Look for webhook delivery issues
4. Check "Payments" for declined payments

### 5. Check webhook logs

```sql
SELECT 
  "action",
  "details",
  "createdAt"
FROM "AuditLog"
WHERE "action" LIKE 'stripe%'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC
LIMIT 50;
```

## Common Causes

### 1. Webhook Endpoint Down

**Symptoms**: Stripe dashboard shows failed webhook deliveries

**Actions**:
- Check app health/uptime
- Verify webhook URL is correct
- Check webhook signing secret

### 2. Stripe API Issues

**Symptoms**: Stripe status page shows degradation

**Actions**:
- Check https://status.stripe.com/
- Wait for Stripe resolution
- Consider manual payment follow-up

### 3. Configuration Issues

**Symptoms**: Specific orgs failing consistently

**Actions**:
- Check org's Stripe Connect status
- Verify Connect account ID is correct
- Check application fee configuration

### 4. Invalid Checkout Sessions

**Symptoms**: Sessions created but immediately failing

**Actions**:
- Check line item configuration
- Verify product/price IDs
- Check currency settings

## Mitigation

### Disable payments for affected org

```sql
UPDATE "OrgSettings"
SET "paymentDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### Global payment disable (emergency)

Set environment variable and restart:
```
FEATURE_STRIPE_ENABLED=false
```

## Resolution

### 1. If webhook issue

Verify webhook configuration:
```bash
# Check current endpoints
stripe webhooks list

# Check endpoint secret matches env var
echo $STRIPE_WEBHOOK_SECRET
```

### 2. If Stripe Connect issue

Check Connect account:
```bash
stripe accounts retrieve acct_xxx
```

### 3. Retry expired/failed payments

For orders that can be retried:
```sql
-- Find retryable orders
SELECT 
  o."id",
  o."orgId",
  o."totalCents",
  pl."status"
FROM "Order" o
JOIN "OrderPaymentLink" pl ON pl."orderId" = o."id"
WHERE pl."status" IN ('expired', 'failed')
  AND o."status" = 'confirmed'
  AND o."createdAt" > NOW() - INTERVAL '24 hours';
```

Then trigger payment retry via API or admin UI.

## Prevention

- Monitor Stripe webhook success rate
- Set up Stripe webhook failure alerts
- Add payment retry logic
- Consider SMS notification for payment issues

## Post-Incident

- [ ] Verify all webhooks are being received
- [ ] Check for stuck orders needing manual intervention
- [ ] Notify affected customers if needed
- [ ] Update monitoring for this failure mode
- [ ] Consider adding payment status dashboard
