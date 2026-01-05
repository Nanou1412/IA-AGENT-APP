/**
 * Cost Tracker
 * 
 * Tracks and enforces cost budgets per organization.
 * Phase 8: Production Readiness
 * 
 * Features:
 * - Track AI/LLM costs
 * - Track Twilio costs
 * - Track Stripe fees
 * - Enforce monthly budgets
 * - Block actions when budget exceeded (if hardLimit=true)
 */

import { prisma } from '@/lib/prisma';
import { increment, METRIC_NAMES } from '@/lib/metrics';

// ============================================================================
// Types
// ============================================================================

export interface CostCheckResult {
  allowed: boolean;
  remaining: number;
  used: number;
  budget: number;
  percentUsed: number;
  reason?: string;
}

export interface MonthlyOrgCostSummary {
  month: string;
  aiCostUsd: number;
  twilioCostUsd: number;
  stripeFeesUsd: number;
  totalCostUsd: number;
  aiTokensInput: number;
  aiTokensOutput: number;
  smsCount: number;
  voiceMinutes: number;
}

export interface BudgetStatus {
  ai: CostCheckResult;
  twilio: CostCheckResult;
  total: {
    used: number;
    budget: number;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get current month string (YYYY-MM)
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Estimate cost from tokens (GPT-4o-mini pricing as default)
 * Input: $0.15 per 1M tokens = $0.00000015 per token
 * Output: $0.60 per 1M tokens = $0.0000006 per token
 */
export function estimateCostFromTokens(
  inputTokens: number,
  outputTokens: number,
  model: string = 'gpt-4o-mini'
): number {
  // Pricing per token (in USD)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
    'gpt-4o': { input: 0.0000025, output: 0.00001 },
    'gpt-4-turbo': { input: 0.00001, output: 0.00003 },
    'gpt-3.5-turbo': { input: 0.0000005, output: 0.0000015 },
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
}

/**
 * Get or create monthly cost record for an org
 */
async function getOrCreateMonthlyCost(orgId: string, month: string) {
  return prisma.monthlyOrgCost.upsert({
    where: { orgId_month: { orgId, month } },
    create: { orgId, month },
    update: {},
  });
}

// ============================================================================
// Cost Recording
// ============================================================================

/**
 * Record AI/LLM cost for an organization
 * 
 * @param orgId Organization ID
 * @param costUsd Cost in USD (e.g., 0.002 for a typical GPT-4 call)
 * @param tokensInput Number of input tokens
 * @param tokensOutput Number of output tokens
 */
export async function recordAiCost(
  orgId: string,
  costUsd: number,
  tokensInput?: number,
  tokensOutput?: number
): Promise<void> {
  const month = getCurrentMonth();
  
  await prisma.monthlyOrgCost.upsert({
    where: { orgId_month: { orgId, month } },
    create: {
      orgId,
      month,
      aiCostUsd: costUsd,
      totalCostUsd: costUsd,
      aiTokensInput: tokensInput || 0,
      aiTokensOutput: tokensOutput || 0,
    },
    update: {
      aiCostUsd: { increment: costUsd },
      totalCostUsd: { increment: costUsd },
      aiTokensInput: { increment: tokensInput || 0 },
      aiTokensOutput: { increment: tokensOutput || 0 },
    },
  });
}

/**
 * Record Twilio cost for an organization
 * 
 * @param orgId Organization ID
 * @param costUsd Cost in USD
 * @param type Type of Twilio usage ('sms' | 'voice')
 * @param quantity Quantity (1 for SMS, minutes for voice)
 */
export async function recordTwilioCost(
  orgId: string,
  costUsd: number,
  type: 'sms' | 'voice',
  quantity: number = 1
): Promise<void> {
  const month = getCurrentMonth();
  
  const updateData: Record<string, unknown> = {
    twilioCostUsd: { increment: costUsd },
    totalCostUsd: { increment: costUsd },
  };
  
  if (type === 'sms') {
    updateData.smsCount = { increment: quantity };
  } else {
    updateData.voiceMinutes = { increment: quantity };
  }
  
  await prisma.monthlyOrgCost.upsert({
    where: { orgId_month: { orgId, month } },
    create: {
      orgId,
      month,
      twilioCostUsd: costUsd,
      totalCostUsd: costUsd,
      smsCount: type === 'sms' ? quantity : 0,
      voiceMinutes: type === 'voice' ? quantity : 0,
    },
    update: updateData,
  });
}

/**
 * Record Stripe fees
 */
export async function recordStripeFees(
  orgId: string,
  feesUsd: number
): Promise<void> {
  const month = getCurrentMonth();
  
  await prisma.monthlyOrgCost.upsert({
    where: { orgId_month: { orgId, month } },
    create: {
      orgId,
      month,
      stripeFeesUsd: feesUsd,
      totalCostUsd: feesUsd,
    },
    update: {
      stripeFeesUsd: { increment: feesUsd },
      totalCostUsd: { increment: feesUsd },
    },
  });
}

// ============================================================================
// Cost Queries
// ============================================================================

/**
 * Get current month's cost summary for an org
 */
export async function getCurrentMonthCost(orgId: string): Promise<MonthlyOrgCostSummary> {
  const month = getCurrentMonth();
  
  const cost = await prisma.monthlyOrgCost.findUnique({
    where: { orgId_month: { orgId, month } },
  });
  
  return {
    month,
    aiCostUsd: cost?.aiCostUsd ?? 0,
    twilioCostUsd: cost?.twilioCostUsd ?? 0,
    stripeFeesUsd: cost?.stripeFeesUsd ?? 0,
    totalCostUsd: cost?.totalCostUsd ?? 0,
    aiTokensInput: cost?.aiTokensInput ?? 0,
    aiTokensOutput: cost?.aiTokensOutput ?? 0,
    smsCount: cost?.smsCount ?? 0,
    voiceMinutes: cost?.voiceMinutes ?? 0,
  };
}

/**
 * Get cost history for an org (last N months)
 */
export async function getCostHistory(
  orgId: string,
  months: number = 6
): Promise<MonthlyOrgCostSummary[]> {
  const costs = await prisma.monthlyOrgCost.findMany({
    where: { orgId },
    orderBy: { month: 'desc' },
    take: months,
  });
  
  return costs.map(c => ({
    month: c.month,
    aiCostUsd: c.aiCostUsd,
    twilioCostUsd: c.twilioCostUsd,
    stripeFeesUsd: c.stripeFeesUsd,
    totalCostUsd: c.totalCostUsd,
    aiTokensInput: c.aiTokensInput,
    aiTokensOutput: c.aiTokensOutput,
    smsCount: c.smsCount,
    voiceMinutes: c.voiceMinutes,
  }));
}

// ============================================================================
// Budget Enforcement
// ============================================================================

/**
 * Check if AI budget allows a new operation
 * 
 * @param orgId Organization ID
 * @param estimatedCostUsd Estimated cost of the operation (optional)
 * @returns CostCheckResult with allowed status and remaining budget
 */
export async function checkAiBudget(
  orgId: string,
  estimatedCostUsd: number = 0
): Promise<CostCheckResult> {
  const [settings, currentCost] = await Promise.all([
    prisma.orgSettings.findUnique({
      where: { orgId },
      select: { monthlyAiBudgetUsd: true, hardBudgetLimit: true },
    }),
    getCurrentMonthCost(orgId),
  ]);
  
  const budget = settings?.monthlyAiBudgetUsd ?? 50;
  const used = currentCost.aiCostUsd;
  const remaining = Math.max(0, budget - used);
  const percentUsed = budget > 0 ? (used / budget) * 100 : 0;
  const hardLimit = settings?.hardBudgetLimit ?? true;
  
  // Check if operation would exceed budget
  const wouldExceed = used + estimatedCostUsd > budget;
  const allowed = !hardLimit || !wouldExceed;
  
  if (!allowed) {
    // Record metric for budget exceeded
    increment(METRIC_NAMES.COST_LIMIT_EXCEEDED, { orgId, type: 'ai' });
  }
  
  return {
    allowed,
    remaining,
    used,
    budget,
    percentUsed,
    reason: !allowed ? `AI budget exceeded: $${used.toFixed(2)} / $${budget.toFixed(2)}` : undefined,
  };
}

/**
 * Check if Twilio budget allows a new operation
 */
export async function checkTwilioBudget(
  orgId: string,
  estimatedCostUsd: number = 0
): Promise<CostCheckResult> {
  const [settings, currentCost] = await Promise.all([
    prisma.orgSettings.findUnique({
      where: { orgId },
      select: { monthlyTwilioBudgetUsd: true, hardBudgetLimit: true },
    }),
    getCurrentMonthCost(orgId),
  ]);
  
  const budget = settings?.monthlyTwilioBudgetUsd ?? 30;
  const used = currentCost.twilioCostUsd;
  const remaining = Math.max(0, budget - used);
  const percentUsed = budget > 0 ? (used / budget) * 100 : 0;
  const hardLimit = settings?.hardBudgetLimit ?? true;
  
  const wouldExceed = used + estimatedCostUsd > budget;
  const allowed = !hardLimit || !wouldExceed;
  
  if (!allowed) {
    increment(METRIC_NAMES.COST_LIMIT_EXCEEDED, { orgId, type: 'twilio' });
  }
  
  return {
    allowed,
    remaining,
    used,
    budget,
    percentUsed,
    reason: !allowed ? `Twilio budget exceeded: $${used.toFixed(2)} / $${budget.toFixed(2)}` : undefined,
  };
}

/**
 * Get full budget status for an org
 */
export async function getBudgetStatus(orgId: string): Promise<BudgetStatus> {
  const [ai, twilio] = await Promise.all([
    checkAiBudget(orgId),
    checkTwilioBudget(orgId),
  ]);
  
  return {
    ai,
    twilio,
    total: {
      used: ai.used + twilio.used,
      budget: ai.budget + twilio.budget,
    },
  };
}

/**
 * Require AI budget (throws if exceeded)
 * Use before making LLM calls
 */
export async function requireAiBudget(
  orgId: string,
  estimatedCostUsd: number = 0.01
): Promise<void> {
  const check = await checkAiBudget(orgId, estimatedCostUsd);
  
  if (!check.allowed) {
    // Log to audit
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: 'cost.limit_exceeded',
        details: {
          type: 'ai',
          used: check.used,
          budget: check.budget,
          estimatedCost: estimatedCostUsd,
        },
      },
    });
    
    throw new CostLimitError('ai', check);
  }
}

/**
 * Require Twilio budget (throws if exceeded)
 * Use before sending SMS/making calls
 */
export async function requireTwilioBudget(
  orgId: string,
  estimatedCostUsd: number = 0.01
): Promise<void> {
  const check = await checkTwilioBudget(orgId, estimatedCostUsd);
  
  if (!check.allowed) {
    await prisma.auditLog.create({
      data: {
        orgId,
        actorUserId: 'system',
        action: 'cost.limit_exceeded',
        details: {
          type: 'twilio',
          used: check.used,
          budget: check.budget,
          estimatedCost: estimatedCostUsd,
        },
      },
    });
    
    throw new CostLimitError('twilio', check);
  }
}

// ============================================================================
// Errors
// ============================================================================

export class CostLimitError extends Error {
  readonly type: 'ai' | 'twilio';
  readonly checkResult: CostCheckResult;
  
  constructor(type: 'ai' | 'twilio', checkResult: CostCheckResult) {
    super(checkResult.reason || `${type} cost limit exceeded`);
    this.name = 'CostLimitError';
    this.type = type;
    this.checkResult = checkResult;
  }
}

// ============================================================================
// Cost Estimation Helpers
// ============================================================================

// OpenAI pricing (approximate, for GPT-4)
const AI_COST_PER_1K_INPUT_TOKENS = 0.03;
const AI_COST_PER_1K_OUTPUT_TOKENS = 0.06;

// Twilio pricing (approximate, Australia)
const TWILIO_SMS_COST_AUD = 0.08;
const TWILIO_VOICE_COST_PER_MIN_AUD = 0.02;

/**
 * Estimate AI cost from token counts
 */
export function estimateAiCost(tokensInput: number, tokensOutput: number): number {
  const inputCost = (tokensInput / 1000) * AI_COST_PER_1K_INPUT_TOKENS;
  const outputCost = (tokensOutput / 1000) * AI_COST_PER_1K_OUTPUT_TOKENS;
  return inputCost + outputCost;
}

/**
 * Estimate Twilio SMS cost
 */
export function estimateTwilioSmsCost(): number {
  return TWILIO_SMS_COST_AUD;
}

/**
 * Estimate Twilio voice cost
 */
export function estimateTwilioVoiceCost(estimatedMinutes: number): number {
  return estimatedMinutes * TWILIO_VOICE_COST_PER_MIN_AUD;
}
