/**
 * Twilio Messaging Helpers
 * 
 * Centralized helper functions for Twilio message operations.
 * Handles org resolution, logging, audit, and messaging configuration.
 */

import { prisma } from '@/lib/prisma';
import { MessagingChannel, MessageDirection, Prisma } from '@prisma/client';
import { 
  normalizePhoneNumber, 
  isWhatsAppNumber,
  DEFAULT_INBOUND_REPLY_TEXT,
  DEFAULT_DENIED_TEXT,
  DEFAULT_HANDOFF_TEXT,
  DEFAULT_UNMAPPED_TEXT,
} from './twilio';

// ============================================================================
// Types
// ============================================================================

export interface ResolvedEndpoint {
  endpointId: string;
  orgId: string;
  channel: MessagingChannel;
  twilioPhoneNumber: string;
  isActive: boolean;
}

export interface MessageLogInput {
  orgId: string;
  endpointId?: string | null;
  channel: MessagingChannel;
  direction: MessageDirection;
  twilioMessageSid?: string | null;
  from: string;
  to: string;
  body: string;
  status?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw?: Record<string, unknown>;
}

/**
 * Configured messaging texts for an org
 */
export interface MessagingTexts {
  locale: string;
  inboundReply: string;
  denied: string;
  handoff: string;
  unmapped: string;
}

/**
 * Handoff configuration for an org
 */
export interface HandoffConfig {
  phone: string | null;
  email: string | null;
  smsTo: string | null;
}

/**
 * Industry modules configuration
 */
export interface IndustryModules {
  sms: boolean;
  whatsapp: boolean;
  voice: boolean;
  payment: boolean;
}

// ============================================================================
// Org Resolution
// ============================================================================

/**
 * Resolve org from Twilio "To" number
 * 
 * For inbound messages, the "To" field is our Twilio number.
 * We look up which org owns that number for the given channel.
 * 
 * @param toNumber - The Twilio phone number receiving the message
 * @param channel - sms or whatsapp
 * @returns Resolved endpoint info or null
 */
export async function resolveOrgFromTwilioNumber(
  toNumber: string,
  channel: MessagingChannel
): Promise<ResolvedEndpoint | null> {
  // Normalize the phone number for lookup
  const normalizedTo = normalizePhoneNumber(toNumber, channel === 'whatsapp' ? 'whatsapp' : 'sms');
  
  // Also try without WhatsApp prefix for flexibility
  const rawNumber = isWhatsAppNumber(normalizedTo) 
    ? normalizedTo.slice(9) // Remove 'whatsapp:'
    : normalizedTo;

  // Find endpoint matching this number and channel
  const endpoint = await prisma.channelEndpoint.findFirst({
    where: {
      channel,
      isActive: true,
      OR: [
        { twilioPhoneNumber: normalizedTo },
        { twilioPhoneNumber: rawNumber },
        // Try with WhatsApp prefix if not already
        ...(channel === 'whatsapp' ? [{ twilioPhoneNumber: `whatsapp:${rawNumber}` }] : []),
      ],
    },
  });

  if (!endpoint) {
    return null;
  }

  return {
    endpointId: endpoint.id,
    orgId: endpoint.orgId,
    channel: endpoint.channel,
    twilioPhoneNumber: endpoint.twilioPhoneNumber,
    isActive: endpoint.isActive,
  };
}

/**
 * Get active endpoint for an org and channel
 * Used for outbound sending
 */
export async function getActiveEndpointForOrg(
  orgId: string,
  channel: MessagingChannel
): Promise<ResolvedEndpoint | null> {
  const endpoint = await prisma.channelEndpoint.findFirst({
    where: {
      orgId,
      channel,
      isActive: true,
    },
  });

  if (!endpoint) {
    return null;
  }

  return {
    endpointId: endpoint.id,
    orgId: endpoint.orgId,
    channel: endpoint.channel,
    twilioPhoneNumber: endpoint.twilioPhoneNumber,
    isActive: endpoint.isActive,
  };
}

// ============================================================================
// Message Logging
// ============================================================================

/**
 * Create a message log entry
 * Handles idempotency via unique twilioMessageSid
 * 
 * @returns The created log or null if duplicate
 */
export async function createMessageLog(
  input: MessageLogInput
): Promise<{ id: string; isDuplicate: boolean }> {
  try {
    const log = await prisma.messageLog.create({
      data: {
        orgId: input.orgId,
        endpointId: input.endpointId,
        channel: input.channel,
        direction: input.direction,
        twilioMessageSid: input.twilioMessageSid,
        from: input.from,
        to: input.to,
        body: input.body,
        status: input.status,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        raw: (input.raw ?? {}) as Prisma.InputJsonValue,
      },
    });

    return { id: log.id, isDuplicate: false };
  } catch (error) {
    // Check for unique constraint violation (duplicate SID)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // This is a duplicate - expected behavior for idempotency
      console.log(`[twilio] Duplicate message SID: ${input.twilioMessageSid}`);
      return { id: '', isDuplicate: true };
    }
    throw error;
  }
}

/**
 * Update message log status (for status callbacks)
 */
export async function updateMessageLogStatus(
  twilioMessageSid: string,
  status: string,
  errorCode?: string | null,
  errorMessage?: string | null
): Promise<void> {
  await prisma.messageLog.updateMany({
    where: { twilioMessageSid },
    data: {
      status,
      errorCode,
      errorMessage,
      updatedAt: new Date(),
    },
  });
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Create audit log entry for Twilio events
 */
export async function logTwilioAudit(
  action: string,
  details: Record<string, unknown>,
  options?: {
    orgId?: string | null;
    actorUserId?: string;
  }
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: options?.orgId ?? null,
        actorUserId: options?.actorUserId ?? 'system',
        action,
        details: details as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Don't fail main operation if audit logging fails
    console.error('[twilio] Failed to create audit log:', error, { action, details });
  }
}

// ============================================================================
// Org Settings Helpers
// ============================================================================

/**
 * Get org settings with all necessary fields for gating
 */
export async function getOrgSettingsForGating(orgId: string) {
  return prisma.orgSettings.findUnique({
    where: { orgId },
    include: {
      org: {
        include: {
          industryConfig: true,
        },
      },
    },
  });
}

/**
 * Check if a channel is enabled for an org
 */
export async function isChannelEnabledForOrg(
  orgId: string,
  channel: MessagingChannel
): Promise<boolean> {
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: {
      smsEnabled: true,
      whatsappEnabled: true,
    },
  });

  if (!settings) return false;

  switch (channel) {
    case 'sms':
      return settings.smsEnabled;
    case 'whatsapp':
      return settings.whatsappEnabled;
    default:
      return false;
  }
}

// ============================================================================
// Messaging Texts Configuration
// ============================================================================

/**
 * Get messaging texts for an org with EN fallbacks
 */
export async function getMessagingTexts(orgId: string): Promise<MessagingTexts> {
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: {
      messagingLocale: true,
      defaultInboundReplyText: true,
      deniedReplyText: true,
      handoffReplyText: true,
    },
  });

  return {
    locale: settings?.messagingLocale || 'en-AU',
    inboundReply: settings?.defaultInboundReplyText || DEFAULT_INBOUND_REPLY_TEXT,
    denied: settings?.deniedReplyText || DEFAULT_DENIED_TEXT,
    handoff: settings?.handoffReplyText || DEFAULT_HANDOFF_TEXT,
    unmapped: DEFAULT_UNMAPPED_TEXT, // Always use default for unmapped
  };
}

/**
 * Get messaging texts from settings object (no DB call)
 */
export function getMessagingTextsFromSettings(settings: {
  messagingLocale?: string | null;
  defaultInboundReplyText?: string | null;
  deniedReplyText?: string | null;
  handoffReplyText?: string | null;
} | null): MessagingTexts {
  return {
    locale: settings?.messagingLocale || 'en-AU',
    inboundReply: settings?.defaultInboundReplyText || DEFAULT_INBOUND_REPLY_TEXT,
    denied: settings?.deniedReplyText || DEFAULT_DENIED_TEXT,
    handoff: settings?.handoffReplyText || DEFAULT_HANDOFF_TEXT,
    unmapped: DEFAULT_UNMAPPED_TEXT,
  };
}

// ============================================================================
// Handoff Configuration
// ============================================================================

/**
 * Get handoff configuration for an org
 */
export async function getHandoffConfig(orgId: string): Promise<HandoffConfig> {
  const settings = await prisma.orgSettings.findUnique({
    where: { orgId },
    select: {
      handoffPhone: true,
      handoffEmail: true,
      handoffSmsTo: true,
    },
  });

  return {
    phone: settings?.handoffPhone || null,
    email: settings?.handoffEmail || null,
    smsTo: settings?.handoffSmsTo || null,
  };
}

/**
 * Get handoff config from settings object (no DB call)
 */
export function getHandoffConfigFromSettings(settings: {
  handoffPhone?: string | null;
  handoffEmail?: string | null;
  handoffSmsTo?: string | null;
} | null): HandoffConfig {
  return {
    phone: settings?.handoffPhone || null,
    email: settings?.handoffEmail || null,
    smsTo: settings?.handoffSmsTo || null,
  };
}

/**
 * Log handoff trigger event
 */
export async function logHandoffTriggered(
  orgId: string,
  reason: string,
  details: Record<string, unknown>
): Promise<void> {
  await logTwilioAudit('twilio.handoff_triggered', {
    reason,
    ...details,
  }, { orgId });
}

// ============================================================================
// Industry Module Gating
// ============================================================================

/**
 * Parse industry modules from IndustryConfig.modules JSON
 */
export function parseIndustryModules(modulesJson: unknown): IndustryModules {
  const defaults: IndustryModules = {
    sms: true,
    whatsapp: true,
    voice: false,
    payment: true,
  };

  if (!modulesJson || typeof modulesJson !== 'object') {
    return defaults;
  }

  const modules = modulesJson as Record<string, unknown>;

  return {
    sms: typeof modules.sms === 'boolean' ? modules.sms : defaults.sms,
    whatsapp: typeof modules.whatsapp === 'boolean' ? modules.whatsapp : defaults.whatsapp,
    voice: typeof modules.voice === 'boolean' ? modules.voice : defaults.voice,
    payment: typeof modules.payment === 'boolean' ? modules.payment : defaults.payment,
  };
}

/**
 * Check if a module is allowed by industry config
 */
export function isModuleAllowedByIndustry(
  industryConfig: { modules?: unknown } | null | undefined,
  module: string
): boolean {
  if (!industryConfig) {
    // No industry config = allow all by default
    return true;
  }

  const modules = parseIndustryModules(industryConfig.modules);

  switch (module) {
    case 'sms':
      return modules.sms;
    case 'whatsapp':
      return modules.whatsapp;
    case 'voice':
      return modules.voice;
    case 'payment':
      return modules.payment;
    default:
      // Unknown modules are allowed by default
      return true;
  }
}

/**
 * Full channel gating check (industry + org toggle)
 * Returns detailed result for logging
 */
export async function checkChannelGating(
  orgId: string,
  channel: MessagingChannel,
  industryConfig: { modules?: unknown } | null | undefined
): Promise<{ allowed: boolean; blockedBy?: 'industry' | 'org_config'; reason?: string }> {
  // Check industry-level first
  if (!isModuleAllowedByIndustry(industryConfig, channel)) {
    return {
      allowed: false,
      blockedBy: 'industry',
      reason: `${channel.toUpperCase()} is not available for this industry`,
    };
  }

  // Check org-level toggle
  const orgEnabled = await isChannelEnabledForOrg(orgId, channel);
  if (!orgEnabled) {
    return {
      allowed: false,
      blockedBy: 'org_config',
      reason: `${channel.toUpperCase()} is not enabled for this organization`,
    };
  }

  return { allowed: true };
}
