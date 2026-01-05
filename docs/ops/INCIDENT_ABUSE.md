# Incident: Abuse Detection Triggered

## Symptoms

- Alert: "Abuse detected"
- `abuse.detected` metric increasing
- Session blocked notifications
- Users complaining about being blocked

## Severity

**P3** - Medium, investigate within 4 hours

## Investigation Steps

### 1. Check recent abuse detections

```sql
SELECT 
  "orgId",
  "details"->>'sessionId' as session_id,
  "details"->>'reason' as reason,
  "details"->>'severity' as severity,
  "details"->>'action' as action,
  "createdAt"
FROM "AuditLog"
WHERE "action" = 'abuse.detected'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC
LIMIT 50;
```

### 2. Check blocked sessions

```sql
SELECT 
  "id",
  "orgId",
  "channel",
  "metadata"->>'blocked' as blocked,
  "metadata"->>'blockedReason' as blocked_reason,
  "metadata"->>'blockedAt' as blocked_at
FROM "ConversationSession"
WHERE "metadata"->>'blocked' = 'true'
ORDER BY "updatedAt" DESC
LIMIT 20;
```

### 3. Analyze abuse patterns

```sql
SELECT 
  "details"->>'reason' as reason,
  COUNT(*) as count
FROM "AuditLog"
WHERE "action" = 'abuse.detected'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY "details"->>'reason'
ORDER BY count DESC;
```

### 4. Check specific session messages

```sql
SELECT 
  "content",
  "direction",
  "createdAt"
FROM "MessageLog"
WHERE "sessionId" = 'session_xxx'
ORDER BY "createdAt" DESC
LIMIT 50;
```

## Common Abuse Types

### 1. Spam (Identical Messages)

**Pattern**: Same message sent repeatedly

**Legitimate reasons**:
- User confusion / UI issues
- Network retries
- Automated testing

**Action**: Review messages, unblock if legitimate

### 2. Message Flooding

**Pattern**: High volume of messages in short time

**Legitimate reasons**:
- Busy period
- Multi-party conversation
- System integration testing

**Action**: Consider increasing limits for the org

### 3. Handoff Abuse

**Pattern**: Too many handoff requests

**Legitimate reasons**:
- Complex issues genuinely need human
- AI not configured well for use case

**Action**: Review handoff reasons, improve AI config

### 4. Content Policy

**Pattern**: Offensive language detected

**Legitimate reasons**:
- False positive (context matters)
- Foreign language misinterpretation

**Action**: Review content, adjust filters if needed

## Mitigation

### Unblock a session (if false positive)

```sql
UPDATE "ConversationSession"
SET "metadata" = "metadata" - 'blocked' - 'blockedReason' - 'blockedAt'
WHERE "id" = 'session_xxx';
```

Or via code:
```typescript
import { unblockSession } from '@/lib/abuse';
await unblockSession('session_xxx', 'admin_user_id');
```

### Adjust abuse thresholds for org

This requires code changes in `abuse.ts` or add org-specific config:

```typescript
const customConfig = {
  maxIdenticalMessagesPerHour: 20, // Higher threshold
  maxMessagesPerHour: 200,
};
```

## Resolution

1. **Verify if abuse is real or false positive**
   - Review message content
   - Check session context
   - Talk to org owner if needed

2. **If false positive**:
   - Unblock the session
   - Consider adjusting thresholds
   - Log as false positive for tuning

3. **If real abuse**:
   - Keep session blocked
   - Consider blocking at org level if systemic
   - Monitor for continued attempts

## Prevention

- Regular review of abuse thresholds
- Per-org configurable limits
- User education about rate limits
- Better error messages for legitimate users

## Post-Incident

- [ ] Document if this was a false positive
- [ ] Update detection thresholds if needed
- [ ] Consider adding context-aware detection
- [ ] Review if org needs custom limits
- [ ] Track false positive rate
