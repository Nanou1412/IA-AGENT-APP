# Incident: High Engine Error Rate

## Symptoms

- Alert: "High Engine Error Rate"
- `engine.error.count` metric spiking
- Users reporting AI not responding
- Engine runs with status `error` in DB

## Severity

**P1** - Critical, immediate action required

## Investigation Steps

### 1. Check error rate

```sql
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  "status",
  COUNT(*) as count
FROM "EngineRun"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY hour, "status"
ORDER BY hour DESC;
```

### 2. Get recent error details

```sql
SELECT 
  "id",
  "orgId",
  "status",
  "error",
  "createdAt"
FROM "EngineRun"
WHERE "status" IN ('error', 'failed')
  AND "createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC
LIMIT 50;
```

### 3. Check for specific error patterns

```sql
SELECT 
  "error"->>'message' as error_message,
  COUNT(*) as count
FROM "EngineRun"
WHERE "status" = 'error'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY "error"->>'message'
ORDER BY count DESC;
```

### 4. Check OpenAI API status

1. Visit https://status.openai.com/
2. Check recent API status
3. Look for rate limit errors in logs

### 5. Check for specific org issues

```sql
SELECT 
  "orgId",
  COUNT(*) as error_count
FROM "EngineRun"
WHERE "status" = 'error'
  AND "createdAt" > NOW() - INTERVAL '1 hour'
GROUP BY "orgId"
ORDER BY error_count DESC
LIMIT 10;
```

## Common Causes

### 1. OpenAI API Issues

**Symptoms**: 429 rate limit errors, 500 errors from OpenAI

**Actions**:
- Check OpenAI status page
- Reduce concurrent requests
- Consider switching to backup model

### 2. Invalid Prompts

**Symptoms**: Errors mentioning "prompt" or "content policy"

**Actions**:
- Check recent prompt changes
- Review org-specific prompts for issues
- Rollback problematic prompts

### 3. Memory/Context Issues

**Symptoms**: Errors about context length, token limits

**Actions**:
- Check message history truncation
- Review conversation length limits

### 4. Database Issues

**Symptoms**: Prisma errors, connection timeouts

**Actions**:
- Check database connection pool
- Review slow query logs
- Check database CPU/memory

## Mitigation

### Emergency: Disable AI globally

Set environment variable and restart:
```
FEATURE_AI_ENGINE_ENABLED=false
```

### Per-org disable

```sql
UPDATE "OrgSettings"
SET "aiDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### Lower rate limits

```sql
UPDATE "OrgSettings"
SET "maxEngineRunsPerMinute" = 5
WHERE "orgId" IN (
  SELECT "orgId" FROM "EngineRun"
  WHERE "status" = 'error'
    AND "createdAt" > NOW() - INTERVAL '1 hour'
  GROUP BY "orgId"
  HAVING COUNT(*) > 50
);
```

## Resolution

1. Identify root cause from error logs
2. Apply targeted fix (prompt change, rate limit, etc.)
3. Monitor error rate for improvement
4. Re-enable features once stable:
   ```sql
   UPDATE "OrgSettings"
   SET "aiDisabled" = false
   WHERE "aiDisabled" = true;
   ```

## Prevention

- Implement circuit breaker pattern
- Set up OpenAI status monitoring
- Add fallback models
- Improve error categorization

## Post-Incident

- [ ] Document root cause
- [ ] Update error handling if needed
- [ ] Add specific alert for this error type
- [ ] Review retry logic
- [ ] Consider adding fallback behavior
