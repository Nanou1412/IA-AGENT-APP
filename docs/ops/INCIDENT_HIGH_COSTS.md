# Incident: High Costs

## Symptoms

- Alert: "Budget Exceeded"
- Monthly cost spike visible in admin panel
- `cost.limit.exceeded` metric increasing

## Severity

**P2** - Needs attention within 1 hour

## Investigation Steps

### 1. Identify the org(s) affected

```sql
SELECT 
  "orgId",
  "month",
  "aiCostUsd",
  "twilioCostUsd",
  "totalEngineRuns",
  "totalTokensInput",
  "totalTokensOutput"
FROM "MonthlyOrgCost"
WHERE "month" = TO_CHAR(NOW(), 'YYYY-MM')
ORDER BY "aiCostUsd" + "twilioCostUsd" DESC
LIMIT 20;
```

### 2. Check recent engine runs

```sql
SELECT 
  "orgId",
  "status",
  COUNT(*) as run_count,
  SUM(("tokensUsed"->>'input')::int) as total_input,
  SUM(("tokensUsed"->>'output')::int) as total_output
FROM "EngineRun"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY "orgId", "status"
ORDER BY run_count DESC
LIMIT 20;
```

### 3. Check for abuse patterns

```sql
SELECT 
  "orgId",
  "sessionId",
  COUNT(*) as message_count
FROM "MessageLog"
WHERE "createdAt" > NOW() - INTERVAL '1 hour'
  AND "direction" = 'inbound'
GROUP BY "orgId", "sessionId"
HAVING COUNT(*) > 50
ORDER BY message_count DESC;
```

### 4. Compare with budget limits

```sql
SELECT 
  o."id",
  o."name",
  s."monthlyAiBudgetUsd",
  s."monthlyTwilioBudgetUsd",
  s."hardBudgetLimit",
  c."aiCostUsd",
  c."twilioCostUsd"
FROM "Org" o
JOIN "OrgSettings" s ON o."id" = s."orgId"
LEFT JOIN "MonthlyOrgCost" c ON o."id" = c."orgId" AND c."month" = TO_CHAR(NOW(), 'YYYY-MM')
WHERE c."aiCostUsd" > s."monthlyAiBudgetUsd" * 0.8
   OR c."twilioCostUsd" > s."monthlyTwilioBudgetUsd" * 0.8;
```

## Mitigation

### Option A: Temporarily disable AI for the org

```sql
UPDATE "OrgSettings"
SET "aiDisabled" = true
WHERE "orgId" = 'org_xxx';
```

### Option B: Lower rate limits for the org

```sql
UPDATE "OrgSettings"
SET 
  "maxEngineRunsPerMinute" = 10,
  "maxMessagesPerMinute" = 5
WHERE "orgId" = 'org_xxx';
```

### Option C: Enable hard budget limit

```sql
UPDATE "OrgSettings"
SET "hardBudgetLimit" = true
WHERE "orgId" = 'org_xxx';
```

## Resolution

1. Contact org owner to discuss usage patterns
2. Review if legitimate high usage or abuse
3. Adjust budgets if needed:
   ```sql
   UPDATE "OrgSettings"
   SET "monthlyAiBudgetUsd" = 100.0
   WHERE "orgId" = 'org_xxx';
   ```
4. Re-enable features once resolved:
   ```sql
   UPDATE "OrgSettings"
   SET "aiDisabled" = false
   WHERE "orgId" = 'org_xxx';
   ```

## Prevention

- Monitor `cost.limit.exceeded` metric
- Set up weekly cost review
- Enable alerts for 80% budget threshold
- Consider per-conversation token limits in prompts

## Post-Incident

- [ ] Update org's budget if appropriate
- [ ] Log incident in audit log
- [ ] Review abuse detection rules
- [ ] Consider automated responses for next time
