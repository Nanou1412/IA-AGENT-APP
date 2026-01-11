/**
 * Engine Run Tracker
 * 
 * Handles tracking of engine runs and audit logging.
 * Separated for maintainability and single responsibility.
 */

import { prisma } from '@/lib/prisma';
import { EngineRunStatus, ConversationSessionStatus } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreateEngineRunInput {
  orgId?: string;
  sessionId: string;
  agentTemplateId?: string;
  industryConfigId?: string;
  status: EngineRunStatus;
  decision?: Record<string, unknown>;
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  blockedBy?: string;
  errorMessage?: string;
  durationMs?: number;
}

// ============================================================================
// Engine Run Creation
// ============================================================================

/**
 * Create an engine run record
 * Used for analytics, debugging, and rate limiting
 */
export async function createEngineRun(input: CreateEngineRunInput): Promise<{ id: string }> {
  // If no session, create a placeholder for orphan runs
  let sessionId = input.sessionId;

  if (!sessionId) {
    const placeholder = await prisma.conversationSession.create({
      data: {
        orgId: input.orgId || 'system',
        channel: 'sms',
        contactKey: 'unknown',
        status: ConversationSessionStatus.closed,
        metadata: { orphanRun: true } as object,
      },
      select: { id: true },
    });
    sessionId = placeholder.id;
  }

  const run = await prisma.engineRun.create({
    data: {
      orgId: input.orgId,
      sessionId,
      agentTemplateId: input.agentTemplateId,
      industryConfigId: input.industryConfigId,
      status: input.status,
      decision: (input.decision || {}) as object,
      modelUsed: input.modelUsed,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd,
      blockedBy: input.blockedBy,
      errorMessage: input.errorMessage,
      durationMs: input.durationMs,
    },
    select: { id: true },
  });

  return run;
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log an engine audit event
 */
export async function logEngineAudit(
  action: string,
  details: Record<string, unknown>,
  context?: { orgId?: string; sessionId?: string }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: context?.orgId || null,
        actorUserId: 'system',
        action,
        details: {
          ...details,
          sessionId: context?.sessionId,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[run-tracker] Failed to log audit:', error);
  }
}

// ============================================================================
// Run Statistics
// ============================================================================

/**
 * Get run statistics for an organization within a time window
 */
export async function getOrgRunStats(
  orgId: string,
  sinceMinutes: number = 60
): Promise<{
  totalRuns: number;
  successfulRuns: number;
  handoffRuns: number;
  blockedRuns: number;
  errorRuns: number;
}> {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

  const runs = await prisma.engineRun.groupBy({
    by: ['status'],
    where: {
      orgId,
      createdAt: { gte: since },
    },
    _count: { id: true },
  });

  const stats = {
    totalRuns: 0,
    successfulRuns: 0,
    handoffRuns: 0,
    blockedRuns: 0,
    errorRuns: 0,
  };

  for (const run of runs) {
    stats.totalRuns += run._count.id;
    switch (run.status) {
      case EngineRunStatus.success:
        stats.successfulRuns = run._count.id;
        break;
      case EngineRunStatus.handoff:
        stats.handoffRuns = run._count.id;
        break;
      case EngineRunStatus.blocked:
        stats.blockedRuns = run._count.id;
        break;
      case EngineRunStatus.error:
        stats.errorRuns = run._count.id;
        break;
    }
  }

  return stats;
}
