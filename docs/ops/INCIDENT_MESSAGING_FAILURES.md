# Incident: Messaging Failures (Twilio)

## Symptoms

- Alert: "Twilio Message Failed"
- `twilio.sms.outbound` metric flat while inbound continues
- Users not receiving SMS replies
- MessageLog entries with delivery failures

## Severity

**P1** - Critical, customers not receiving responses

## Investigation Steps

### 1. Check recent message delivery status

```sql
SELECT 
  "status",
  COUNT(*) as count
FROM "MessageLog"
WHERE "direction" = 'outbound'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY "status";
```

### 2. Get specific failures

```sql
SELECT 
  "id",
  "orgId",
  "channel",
  "status",
  "metadata"->>'twilioErrorCode' as error_code,
  "metadata"->>'twilioErrorMessage' as error_message,
  "createdAt"
FROM "MessageLog"
WHERE "direction" = 'outbound'
  AND "status" IN ('failed', 'undelivered')
  AND "createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC
LIMIT 50;
```

### 3. Check Twilio Dashboard

1. Go to https://console.twilio.com/
2. Check "Monitor" > "Logs" > "Messages"
3. Look for error patterns
4. Check account balance

### 4. Check by org

```sql
SELECT 
  "orgId",
  COUNT(*) FILTER (WHERE "status" = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE "status" = 'failed') as failed,
  COUNT(*) FILTER (WHERE "status" = 'undelivered') as undelivered
FROM "MessageLog"
WHERE "direction" = 'outbound'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY "orgId"
ORDER BY failed DESC;
```

### 5. Common Twilio error codes

| Code | Meaning | Action |
|------|---------|--------|
| 30003 | Unreachable destination | Normal, user phone issue |
| 30004 | Message blocked | Carrier spam filter |
| 30005 | Unknown destination | Invalid phone number |
| 30006 | Landline destination | Can't SMS to landline |
| 30007 | Carrier violation | Content issue |
| 30008 | Unknown error | Retry needed |
| 21211 | Invalid To number | Phone format issue |
| 21608 | Messaging to this country not allowed | Geo restriction |

## Common Causes

### 1. Twilio Account Issues

**Symptoms**: All messages failing, balance errors

**Actions**:
- Check Twilio account balance
- Check for account suspension
- Verify API credentials

### 2. Phone Number Issues

**Symptoms**: Specific sending numbers failing

**Actions**:
- Check phone number status in Twilio
- Verify number is active
- Check messaging service configuration

### 3. Content Filtering

**Symptoms**: Only certain messages failing

**Actions**:
- Check message content for spam triggers
- Review Twilio A2P compliance
- Check if messages contain blocked URLs

### 4. Rate Limiting

**Symptoms**: Some messages queued, delays

**Actions**:
- Check Twilio rate limits
- Review message queue status
- Consider upgrading messaging service

## Mitigation

### Disable SMS for affected org

```sql
UPDATE "OrgSettings"
SET "smsDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### Global SMS disable (emergency)

Set environment variable and restart:
```
FEATURE_SMS_ENABLED=false
```

### Lower message rate

```sql
UPDATE "OrgSettings"
SET "maxMessagesPerMinute" = 5
WHERE "orgId" = 'org_xxx';
```

## Resolution

### 1. If account balance issue

Top up Twilio account:
- Log into Twilio console
- Add funds to account
- Set up auto-recharge

### 2. If phone number issue

Check number status:
```bash
# Via Twilio CLI
twilio phone-numbers:fetch +1XXXXXXXXXX
```

### 3. If content filtering

- Review message templates
- Remove URL shorteners
- Ensure A2P compliance

### 4. Retry failed messages

```sql
-- Find recent failed messages to retry
SELECT 
  "id",
  "orgId",
  "content",
  "metadata"
FROM "MessageLog"
WHERE "direction" = 'outbound'
  AND "status" = 'failed'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
  AND "metadata"->>'twilioErrorCode' IN ('30008', '21408');
```

## Prevention

- Set up Twilio account balance alerts
- Monitor message delivery rate
- Implement message content validation
- Use Twilio Messaging Service for better deliverability

## Post-Incident

- [ ] Document root cause
- [ ] Update error handling for this error type
- [ ] Review message content templates
- [ ] Check other orgs for similar issues
- [ ] Consider SMS delivery monitoring dashboard
