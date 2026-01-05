/**
 * Abuse Detection
 * 
 * Detects and mitigates abusive usage patterns.
 * Phase 8: Production Readiness
 * 
 * Rules:
 * - Too many identical messages (spam)
 * - Too many handoffs (system gaming)
 * - Offensive language patterns (if configured)
 * 
 * Actions:
 * - Temporarily disable module for session/org
 * - Log to AuditLog
 * - Alert (via alerts system)
 */

import { prisma } from '@/lib/prisma';
import { increment, METRIC_NAMES } from '@/lib/metrics';
import { sendAlert, AlertSeverity } from '@/lib/alerts';

// ============================================================================
// Types
// ============================================================================

export interface AbuseCheckResult {
  abusive: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high';
  action?: 'warn' | 'block_session' | 'block_org';
}

export interface AbuseConfig {
  // Spam detection
  maxIdenticalMessagesPerHour: number;
  maxMessagesPerHour: number;
  
  // Handoff abuse
  maxHandoffsPerHour: number;
  maxHandoffsPerDay: number;
  
  // Content filtering (optional)
  enableContentFilter: boolean;
  offensivePatterns?: RegExp[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_ABUSE_CONFIG: AbuseConfig = {
  maxIdenticalMessagesPerHour: 10,
  maxMessagesPerHour: 100,
  maxHandoffsPerHour: 5,
  maxHandoffsPerDay: 15,
  enableContentFilter: false,
  offensivePatterns: [],
};

// ============================================================================
// Abuse Detection Functions
// ============================================================================

/**
 * Check for spam (too many identical messages)
 */
export async function checkSpamAbuse(
  orgId: string,
  sessionId: string,
  messageContent: string,
  config: Partial<AbuseConfig> = {}
): Promise<AbuseCheckResult> {
  const cfg = { ...DEFAULT_ABUSE_CONFIG, ...config };
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  // Hash message for comparison (normalize whitespace)
  const normalizedMessage = messageContent.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Count recent messages from this session using ConversationTurn
  const recentMessages = await prisma.conversationTurn.findMany({
    where: {
      sessionId,
      role: 'user',
      createdAt: { gte: oneHourAgo },
    },
    select: { text: true },
    take: 200,
  });
  
  // Check for identical messages
  const identicalCount = recentMessages.filter(
    m => m.text?.toLowerCase().trim().replace(/\s+/g, ' ') === normalizedMessage
  ).length;
  
  if (identicalCount >= cfg.maxIdenticalMessagesPerHour) {
    return {
      abusive: true,
      reason: `Spam detected: ${identicalCount} identical messages in the last hour`,
      severity: 'medium',
      action: 'block_session',
    };
  }
  
  // Check for message flooding
  if (recentMessages.length >= cfg.maxMessagesPerHour) {
    return {
      abusive: true,
      reason: `Message flooding: ${recentMessages.length} messages in the last hour`,
      severity: 'medium',
      action: 'block_session',
    };
  }
  
  return { abusive: false };
}

/**
 * Check for handoff abuse (gaming the system)
 */
export async function checkHandoffAbuse(
  orgId: string,
  sessionId: string,
  config: Partial<AbuseConfig> = {}
): Promise<AbuseCheckResult> {
  const cfg = { ...DEFAULT_ABUSE_CONFIG, ...config };
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Count recent handoffs for this session
  const [hourlyHandoffs, dailyHandoffs] = await Promise.all([
    prisma.auditLog.count({
      where: {
        orgId,
        action: { contains: 'handoff' },
        createdAt: { gte: oneHourAgo },
        details: { path: ['sessionId'], equals: sessionId },
      },
    }),
    prisma.auditLog.count({
      where: {
        orgId,
        action: { contains: 'handoff' },
        createdAt: { gte: oneDayAgo },
        details: { path: ['sessionId'], equals: sessionId },
      },
    }),
  ]);
  
  if (hourlyHandoffs >= cfg.maxHandoffsPerHour) {
    return {
      abusive: true,
      reason: `Excessive handoffs: ${hourlyHandoffs} in the last hour`,
      severity: 'high',
      action: 'block_session',
    };
  }
  
  if (dailyHandoffs >= cfg.maxHandoffsPerDay) {
    return {
      abusive: true,
      reason: `Excessive handoffs: ${dailyHandoffs} in the last 24 hours`,
      severity: 'medium',
      action: 'block_session',
    };
  }
  
  return { abusive: false };
}

/**
 * Check message content for offensive patterns
 */
export function checkContentAbuse(
  messageContent: string,
  config: Partial<AbuseConfig> = {}
): AbuseCheckResult {
  const cfg = { ...DEFAULT_ABUSE_CONFIG, ...config };
  
  if (!cfg.enableContentFilter || !cfg.offensivePatterns?.length) {
    return { abusive: false };
  }
  
  const normalizedMessage = messageContent.toLowerCase();
  
  for (const pattern of cfg.offensivePatterns) {
    if (pattern.test(normalizedMessage)) {
      return {
        abusive: true,
        reason: 'Offensive content detected',
        severity: 'high',
        action: 'warn',
      };
    }
  }
  
  return { abusive: false };
}

/**
 * Full abuse check (combines all checks)
 */
export async function checkAbuse(
  orgId: string,
  sessionId: string,
  messageContent: string,
  config: Partial<AbuseConfig> = {}
): Promise<AbuseCheckResult> {
  // Content check (sync, fast)
  const contentCheck = checkContentAbuse(messageContent, config);
  if (contentCheck.abusive) return contentCheck;
  
  // Spam check
  const spamCheck = await checkSpamAbuse(orgId, sessionId, messageContent, config);
  if (spamCheck.abusive) return spamCheck;
  
  // Handoff abuse (only check if there have been handoffs recently)
  const handoffCheck = await checkHandoffAbuse(orgId, sessionId, config);
  if (handoffCheck.abusive) return handoffCheck;
  
  return { abusive: false };
}

// ============================================================================
// Abuse Response
// ============================================================================

/**
 * Handle detected abuse
 * - Log to audit
 * - Update metrics
 * - Send alert if severe
 * - Optionally disable module
 */
export async function handleAbuse(
  orgId: string,
  sessionId: string,
  checkResult: AbuseCheckResult
): Promise<void> {
  if (!checkResult.abusive) return;
  
  // Log metric
  increment(METRIC_NAMES.ABUSE_DETECTED, {
    orgId,
    reason: checkResult.reason?.split(':')[0] || 'unknown',
  });
  
  // Create audit log
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId: 'system',
      action: 'abuse.detected',
      details: {
        sessionId,
        reason: checkResult.reason,
        severity: checkResult.severity,
        action: checkResult.action,
      },
    },
  });
  
  // Send alert for high severity
  if (checkResult.severity === 'high') {
    await sendAlert({
      severity: AlertSeverity.WARNING,
      title: 'Abuse detected',
      message: `${checkResult.reason} for org ${orgId}`,
      context: {
        orgId,
        sessionId,
        action: checkResult.action,
      },
    });
  }
  
  // Handle action
  if (checkResult.action === 'block_session') {
    // Mark session as blocked in metadata
    await prisma.conversationSession.updateMany({
      where: { id: sessionId },
      data: {
        metadata: JSON.parse(JSON.stringify({
          blocked: true,
          blockedReason: checkResult.reason,
          blockedAt: new Date().toISOString(),
        })),
      },
    });
    
    increment(METRIC_NAMES.ABUSE_MITIGATED, { orgId, action: 'block_session' });
  }
}

/**
 * Check if a session is blocked due to abuse
 */
export async function isSessionBlocked(sessionId: string): Promise<boolean> {
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  
  if (!session?.metadata) return false;
  
  const metadata = session.metadata as Record<string, unknown>;
  return metadata.blocked === true;
}

/**
 * Unblock a session (admin action)
 */
export async function unblockSession(
  sessionId: string,
  adminUserId: string
): Promise<void> {
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { orgId: true, metadata: true },
  });
  
  if (!session) return;
  
  const metadata = (session.metadata as Record<string, unknown>) || {};
  delete metadata.blocked;
  delete metadata.blockedReason;
  delete metadata.blockedAt;
  
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { metadata: JSON.parse(JSON.stringify(metadata)) },
  });
  
  // Audit log
  await prisma.auditLog.create({
    data: {
      orgId: session.orgId,
      actorUserId: adminUserId,
      action: 'abuse.session_unblocked',
      details: { sessionId },
    },
  });
  
  increment(METRIC_NAMES.ABUSE_MITIGATED, { orgId: session.orgId, action: 'unblock' });
}
