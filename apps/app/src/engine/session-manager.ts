/**
 * Engine Session Manager
 * 
 * Handles conversation session lifecycle:
 * - Creating and retrieving sessions
 * - Managing conversation turns
 * - Session metadata
 */

import { prisma } from '@/lib/prisma';
import { MessagingChannel, ConversationSessionStatus, ConversationTurnRole } from '@prisma/client';
import type { LLMMessage } from '@repo/core';
import { ENGINE_CONFIG } from './llm';

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get or create a conversation session
 */
export async function getOrCreateSession(
  orgId: string,
  channel: MessagingChannel,
  contactKey: string,
  externalThreadKey?: string
): Promise<{ id: string; isNew: boolean }> {
  // Try to find existing active session
  const existing = await prisma.conversationSession.findFirst({
    where: {
      orgId,
      channel,
      contactKey,
      status: ConversationSessionStatus.active,
    },
    select: { id: true },
    orderBy: { lastActiveAt: 'desc' },
  });

  if (existing) {
    // Update last active time
    await prisma.conversationSession.update({
      where: { id: existing.id },
      data: { lastActiveAt: new Date() },
    });
    return { id: existing.id, isNew: false };
  }

  // Create new session
  const session = await prisma.conversationSession.create({
    data: {
      orgId,
      channel,
      contactKey,
      externalThreadKey,
      status: ConversationSessionStatus.active,
      metadata: {} as object,
    },
    select: { id: true },
  });

  return { id: session.id, isNew: true };
}

// ============================================================================
// Conversation History
// ============================================================================

/**
 * Load conversation history for a session
 */
export async function loadConversationHistory(sessionId: string): Promise<LLMMessage[]> {
  const turns = await prisma.conversationTurn.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: ENGINE_CONFIG.maxTurns,
    select: {
      role: true,
      text: true,
    },
  });

  return turns.reverse().map(turn => ({
    role: mapTurnRoleToLLM(turn.role),
    content: turn.text,
  }));
}

/**
 * Save a conversation turn
 */
export async function saveConversationTurn(
  sessionId: string,
  channel: MessagingChannel,
  role: 'user' | 'assistant' | 'system' | 'tool',
  text: string,
  raw?: Record<string, unknown>
): Promise<void> {
  await prisma.conversationTurn.create({
    data: {
      sessionId,
      role: role as ConversationTurnRole,
      channel,
      text,
      raw: (raw || {}) as object,
    },
  });
}

// ============================================================================
// Session Metadata
// ============================================================================

/**
 * Get session metadata
 */
export async function getSessionMetadata(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });

  if (!session?.metadata || typeof session.metadata !== 'object') {
    return null;
  }

  return session.metadata as Record<string, unknown>;
}

/**
 * Update session metadata (merge with existing)
 */
export async function updateSessionMetadata(
  sessionId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const current = await getSessionMetadata(sessionId) || {};

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      metadata: { ...current, ...updates } as object,
    },
  });
}

/**
 * Close a session
 */
export async function closeSession(sessionId: string): Promise<void> {
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { status: ConversationSessionStatus.closed },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function mapTurnRoleToLLM(role: ConversationTurnRole): 'system' | 'user' | 'assistant' | 'tool' {
  switch (role) {
    case 'system':
      return 'system';
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
    case 'tool':
      return 'tool';
    default:
      return 'user';
  }
}

/**
 * Normalize phone number to E.164 format
 */
export function normalizePhone(phone: string): string {
  // Remove non-digits except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Handle Australian numbers
  if (normalized.startsWith('0') && normalized.length === 10) {
    normalized = '+61' + normalized.slice(1);
  }

  // Ensure + prefix for international
  if (!normalized.startsWith('+') && normalized.length > 10) {
    normalized = '+' + normalized;
  }

  return normalized;
}
