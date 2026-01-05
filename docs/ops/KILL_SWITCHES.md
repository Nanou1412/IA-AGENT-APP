# Kill Switches Guide

## Overview

Kill switches allow immediate disabling of features for specific orgs or globally.
They are the fastest way to stop problematic behavior in production.

## Per-Org Kill Switches

### Available Switches

| Field | Feature Affected |
|-------|-----------------|
| `aiDisabled` | AI engine processing |
| `smsDisabled` | SMS and WhatsApp messaging |
| `voiceDisabled` | Voice calls |
| `bookingDisabled` | Booking creation/modification |
| `takeawayDisabled` | Takeaway order processing |
| `paymentDisabled` | Payment link generation |

### Activating via SQL

```sql
-- Disable AI for an org
UPDATE "OrgSettings"
SET "aiDisabled" = true
WHERE "orgId" = 'org_xxx';

-- Disable multiple features
UPDATE "OrgSettings"
SET 
  "aiDisabled" = true,
  "smsDisabled" = true,
  "paymentDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### Activating via Code

```typescript
import { activateKillSwitch, FeatureFlag } from '@/lib/feature-flags';

await activateKillSwitch('org_xxx', FeatureFlag.AI_ENGINE, 'admin_user_id');
await activateKillSwitch('org_xxx', FeatureFlag.SMS_MESSAGING, 'admin_user_id');
```

### Deactivating

```sql
-- Re-enable AI for an org
UPDATE "OrgSettings"
SET "aiDisabled" = false
WHERE "orgId" = 'org_xxx';
```

```typescript
import { deactivateKillSwitch, FeatureFlag } from '@/lib/feature-flags';

await deactivateKillSwitch('org_xxx', FeatureFlag.AI_ENGINE, 'admin_user_id');
```

### Checking Status

```sql
SELECT 
  "orgId",
  "aiDisabled",
  "smsDisabled",
  "voiceDisabled",
  "bookingDisabled",
  "takeawayDisabled",
  "paymentDisabled"
FROM "OrgSettings"
WHERE "orgId" = 'org_xxx';
```

```typescript
import { getOrgKillSwitchStatuses } from '@/lib/feature-flags';

const statuses = await getOrgKillSwitchStatuses('org_xxx');
console.log(statuses);
// [{ flag: 'AI_ENGINE', field: 'aiDisabled', disabled: true }, ...]
```

## Global Feature Flags

### Environment Variables

Set these in `.env` or deployment config. **Requires restart to take effect.**

| Variable | Default | Effect |
|----------|---------|--------|
| `FEATURE_AI_ENGINE_ENABLED` | `true` | Enable/disable AI globally |
| `FEATURE_SMS_ENABLED` | `true` | Enable/disable SMS globally |
| `FEATURE_VOICE_ENABLED` | `true` | Enable/disable voice globally |
| `FEATURE_BOOKING_ENABLED` | `true` | Enable/disable booking globally |
| `FEATURE_TAKEAWAY_ENABLED` | `true` | Enable/disable takeaway globally |
| `FEATURE_PAYMENT_ENABLED` | `true` | Enable/disable payments globally |
| `FEATURE_STRIPE_ENABLED` | `true` | Enable/disable Stripe globally |
| `FEATURE_TWILIO_ENABLED` | `true` | Enable/disable Twilio globally |

### Emergency Global Disable

```bash
# In your deployment environment
export FEATURE_AI_ENGINE_ENABLED=false
# Then restart the application
```

Or update Vercel/deployment environment variables and redeploy.

### Checking Global Flags

```typescript
import { isGlobalFeatureEnabled, FeatureFlag } from '@/lib/feature-flags';

if (!isGlobalFeatureEnabled(FeatureFlag.AI_ENGINE)) {
  console.log('AI is globally disabled');
}
```

## Decision Flow

When a feature is requested:

```
1. Is feature globally disabled (env var)?
   → YES: Block with "globally disabled" reason
   → NO: Continue

2. Is org's kill switch active (DB)?
   → YES: Block with "kill switch" reason
   → NO: Continue

3. Is module allowed by industry config?
   → NO: Block with "industry" reason
   → YES: Continue

4. Is sandbox approved?
   → NO: Block with "sandbox" reason
   → YES: Continue

5. Is billing active?
   → NO: Block with "billing" reason
   → YES: ALLOW
```

## Use Cases

### 1. Runaway AI Costs

```sql
UPDATE "OrgSettings"
SET "aiDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### 2. Suspected Fraud

```sql
UPDATE "OrgSettings"
SET 
  "aiDisabled" = true,
  "smsDisabled" = true,
  "paymentDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### 3. Twilio Issues (Global)

```bash
export FEATURE_TWILIO_ENABLED=false
# Restart app
```

### 4. OpenAI Outage (Global)

```bash
export FEATURE_AI_ENGINE_ENABLED=false
# Restart app
```

### 5. Stripe Incident (Global)

```bash
export FEATURE_STRIPE_ENABLED=false
# Restart app
```

## Audit Trail

All kill switch changes are logged:

```sql
SELECT 
  "actorUserId",
  "action",
  "details",
  "createdAt"
FROM "AuditLog"
WHERE "orgId" = 'org_xxx'
  AND "action" LIKE 'kill_switch%'
ORDER BY "createdAt" DESC;
```

## Cache Considerations

Kill switch settings are cached for 30 seconds. After changing:

1. **Immediate effect**: Most requests will see the change within 30s
2. **Force immediate**: Clear cache via code if urgent:

```typescript
import { clearOrgSettingsCache } from '@/lib/feature-flags';
clearOrgSettingsCache('org_xxx');
```

## Best Practices

1. **Always log why** you're activating a kill switch
2. **Notify the org** if it's not an emergency
3. **Set a reminder** to re-evaluate the switch
4. **Document the incident** for post-mortem
5. **Prefer per-org** over global when possible
6. **Use audit log** to track who made changes
