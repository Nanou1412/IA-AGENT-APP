/**
 * Twilio Messaging Actions
 * 
 * Server actions for sending SMS and WhatsApp messages.
 * Includes feature gating, endpoint resolution, and logging.
 * 
 * Phase 8: Uses canUseModuleWithKillSwitch for kill switch enforcement
 */

'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTwilioClient, TWILIO_MESSAGING_SERVICE_SID, normalizePhoneNumber } from '@/lib/twilio';
import {
  getActiveEndpointForOrg,
  createMessageLog,
  logTwilioAudit,
  isChannelEnabledForOrg,
} from '@/lib/twilio-helpers';
import { canUseModuleWithKillSwitch } from '@/lib/feature-gating';
import { MessagingChannel } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface SendMessageResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  blockedBy?: 'sandbox' | 'billing' | 'config' | 'no_endpoint' | 'feature_disabled';
}

export interface SendMessageInput {
  orgId: string;
  to: string;
  body: string;
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function getOrgWithSettings(orgId: string) {
  return prisma.org.findUnique({
    where: { id: orgId },
    include: {
      settings: true,
      industryConfig: true,
    },
  });
}

async function sendMessage(
  input: SendMessageInput,
  channel: MessagingChannel
): Promise<SendMessageResult> {
  const { orgId, to, body } = input;

  // Get authenticated user
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { success: false, error: 'Non authentifié' };
  }

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return { success: false, error: 'Utilisateur non trouvé' };
  }

  // Get org with settings
  const org = await getOrgWithSettings(orgId);
  if (!org) {
    return { success: false, error: 'Organisation non trouvée' };
  }

  // Verify user belongs to org (basic check)
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, orgId },
  });
  if (!membership) {
    return { success: false, error: 'Accès non autorisé' };
  }

  // Feature gating check (Phase 8: includes kill switch)
  const moduleKey = channel === 'sms' ? 'sms' : 'whatsapp';
  const gatingResult = canUseModuleWithKillSwitch(moduleKey, {
    org,
    settings: org.settings,
  });

  if (!gatingResult.allowed) {
    await logTwilioAudit('twilio.outbound.blocked', {
      channel,
      blockedBy: gatingResult.blockedBy,
      reason: gatingResult.reason,
      to,
    }, { orgId, actorUserId: user.id });

    return {
      success: false,
      blockedBy: gatingResult.blockedBy as SendMessageResult['blockedBy'],
      error: gatingResult.reason || 'Fonctionnalité non disponible',
    };
  }

  // Check if channel is enabled for org
  const channelEnabled = await isChannelEnabledForOrg(orgId, channel);
  if (!channelEnabled) {
    await logTwilioAudit('twilio.outbound.channel_disabled', {
      channel,
      to,
    }, { orgId, actorUserId: user.id });

    return {
      success: false,
      blockedBy: 'feature_disabled',
      error: `${channel.toUpperCase()} n'est pas activé pour cette organisation`,
    };
  }

  // Get active endpoint for this org and channel
  const endpoint = await getActiveEndpointForOrg(orgId, channel);
  if (!endpoint) {
    await logTwilioAudit('twilio.outbound.no_endpoint', {
      channel,
      to,
    }, { orgId, actorUserId: user.id });

    return {
      success: false,
      blockedBy: 'no_endpoint',
      error: `Aucun numéro ${channel.toUpperCase()} configuré`,
    };
  }

  // Normalize destination number
  const normalizedTo = normalizePhoneNumber(to, channel === 'whatsapp' ? 'whatsapp' : 'sms');

  try {
    const client = getTwilioClient();

    // Send via Twilio
    const messageOptions: {
      body: string;
      to: string;
      from?: string;
      messagingServiceSid?: string;
      statusCallback?: string;
    } = {
      body,
      to: normalizedTo,
    };

    // Use messaging service if configured, otherwise use endpoint number
    if (TWILIO_MESSAGING_SERVICE_SID) {
      messageOptions.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    } else {
      messageOptions.from = endpoint.twilioPhoneNumber;
    }

    // Status callback URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    messageOptions.statusCallback = `${appUrl}/api/twilio/status`;

    const message = await client.messages.create(messageOptions);

    // Log the outbound message
    await createMessageLog({
      orgId,
      endpointId: endpoint.endpointId,
      channel,
      direction: 'outbound',
      twilioMessageSid: message.sid,
      from: endpoint.twilioPhoneNumber,
      to: normalizedTo,
      body,
      status: message.status,
    });

    await logTwilioAudit('twilio.outbound.sent', {
      channel,
      messageSid: message.sid,
      from: endpoint.twilioPhoneNumber,
      to: normalizedTo,
      bodyPreview: body.substring(0, 50),
    }, { orgId, actorUserId: user.id });

    return {
      success: true,
      messageSid: message.sid,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    const errorCode = (error as { code?: number })?.code?.toString();

    // Log failure
    await createMessageLog({
      orgId,
      endpointId: endpoint.endpointId,
      channel,
      direction: 'outbound',
      from: endpoint.twilioPhoneNumber,
      to: normalizedTo,
      body,
      status: 'failed',
      errorCode,
      errorMessage,
    });

    await logTwilioAudit('twilio.outbound.error', {
      channel,
      error: errorMessage,
      errorCode,
      to: normalizedTo,
    }, { orgId, actorUserId: user.id });

    console.error(`[twilio] Failed to send ${channel} message:`, error);

    return {
      success: false,
      error: `Échec de l'envoi: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Public Actions
// ============================================================================

/**
 * Send an SMS message
 */
export async function sendSms(input: SendMessageInput): Promise<SendMessageResult> {
  return sendMessage(input, 'sms');
}

/**
 * Send a WhatsApp message
 */
export async function sendWhatsApp(input: SendMessageInput): Promise<SendMessageResult> {
  return sendMessage(input, 'whatsapp');
}

/**
 * Get message logs for an org
 */
export async function getMessageLogs(
  orgId: string,
  options?: {
    channel?: MessagingChannel;
    limit?: number;
    offset?: number;
  }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error('Non authentifié');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    throw new Error('Utilisateur non trouvé');
  }

  // Verify access
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, orgId },
  });
  if (!membership) {
    throw new Error('Accès non autorisé');
  }

  const where = {
    orgId,
    ...(options?.channel && { channel: options.channel }),
  };

  const [logs, total] = await Promise.all([
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prisma.messageLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Get channel endpoints for an org
 */
export async function getChannelEndpoints(orgId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error('Non authentifié');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    throw new Error('Utilisateur non trouvé');
  }

  // Verify access
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, orgId },
  });
  if (!membership) {
    throw new Error('Accès non autorisé');
  }

  return prisma.channelEndpoint.findMany({
    where: { orgId },
    orderBy: [{ channel: 'asc' }, { createdAt: 'desc' }],
  });
}
